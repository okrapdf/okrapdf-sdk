/**
 * Safe Metadata Utility for PostHog Analytics
 *
 * CRITICAL: Never send raw financial values to PostHog.
 * This utility calculates analytics-safe metadata from raw values.
 *
 * Privacy-safe metrics include:
 * - wasCorrected (boolean)
 * - correctionType (category)
 * - levenshteinDistance (edit count)
 * - correctionImpact (low/medium/high)
 *
 * See spec: "Why NOT send raw values to PostHog" section
 */

import type { CorrectionType } from './types';

// ============================================================================
// Types
// ============================================================================

export interface VerificationMetadata {
  wasCorrected: boolean;
  correctionType: CorrectionType;
  levenshteinDistance: number;
  correctionImpact: 'low' | 'medium' | 'high';
  magnitudeChange: number | null;  // Percent change (null if not numeric)
  keystrokesSaved: number;         // For gamification
}

export interface SessionMetadata {
  totalFields: number;
  fieldsVerified: number;
  fieldsCorrected: number;
  fieldsFlagged: number;
  fieldsSkipped: number;
  correctionRate: number;          // fieldsCorrected / totalFields
  vendorAccuracyRate: number;      // (total - corrected) / total
  totalDurationMs: number;
  avgFieldTimeMs: number;
  fieldsPerMinute: number;
  correctionsByType: Record<CorrectionType, number>;
}

// ============================================================================
// Levenshtein Distance
// Uses fastest-levenshtein algorithm (O(min(m,n)) space complexity)
// ============================================================================

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  // Ensure a is the shorter string for space optimization
  if (a.length > b.length) {
    [a, b] = [b, a];
  }

  const aLen = a.length;
  const bLen = b.length;

  // Use single array instead of matrix (space optimization)
  let prevRow = new Array(aLen + 1);
  let currRow = new Array(aLen + 1);

  // Initialize first row
  for (let i = 0; i <= aLen; i++) {
    prevRow[i] = i;
  }

  for (let j = 1; j <= bLen; j++) {
    currRow[0] = j;

    for (let i = 1; i <= aLen; i++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      currRow[i] = Math.min(
        prevRow[i] + 1,      // deletion
        currRow[i - 1] + 1,  // insertion
        prevRow[i - 1] + cost // substitution
      );
    }

    // Swap rows
    [prevRow, currRow] = [currRow, prevRow];
  }

  return prevRow[aLen];
}

// ============================================================================
// Numeric Parsing Utilities
// ============================================================================

/**
 * Parse a string value to numeric, handling common financial formats
 * Handles: commas, parentheses for negatives, currency symbols, percentages
 */
export function parseFinancialNumber(value: string): number | null {
  if (!value || typeof value !== 'string') return null;

  // Remove currency symbols and whitespace
  let cleaned = value.replace(/[$€£¥￥\s]/g, '');

  // Handle parentheses as negative (accounting notation)
  const isNegative = cleaned.startsWith('(') && cleaned.endsWith(')');
  if (isNegative) {
    cleaned = cleaned.slice(1, -1);
  }

  // Handle percentage
  const isPercent = cleaned.endsWith('%');
  if (isPercent) {
    cleaned = cleaned.slice(0, -1);
  }

  // Remove commas
  cleaned = cleaned.replace(/,/g, '');

  // Handle explicit negative sign
  const hasNegativeSign = cleaned.startsWith('-');
  if (hasNegativeSign) {
    cleaned = cleaned.slice(1);
  }

  // Parse
  const num = parseFloat(cleaned);
  if (isNaN(num)) return null;

  let result = num;
  if (isPercent) result /= 100;
  if (isNegative || hasNegativeSign) result = -result;

  return result;
}

/**
 * Calculate percent change between two values
 */
export function percentChange(from: number, to: number): number | null {
  if (from === 0) {
    return to === 0 ? 0 : null;  // 0 to 0 is 0%, 0 to X is undefined
  }
  return Math.abs((to - from) / from);
}

// ============================================================================
// Correction Type Detection
// ============================================================================

/**
 * Detect the type of correction made
 * Used for analytics without exposing raw values
 */
export function detectCorrectionType(
  vendorValue: string,
  verifiedValue: string
): CorrectionType {
  if (vendorValue === verifiedValue) {
    return 'formatting_only';
  }

  const vendorNum = parseFinancialNumber(vendorValue);
  const verifiedNum = parseFinancialNumber(verifiedValue);

  // Both are numeric - check for common error patterns
  if (vendorNum !== null && verifiedNum !== null) {
    // Sign flip: -45,200 vs 45,200
    if (Math.abs(vendorNum + verifiedNum) < 0.001 * Math.abs(verifiedNum)) {
      return 'wrong_sign';
    }

    // Check decimal position error FIRST (before magnitude error)
    // Decimal position error: 1450 vs 14.50
    const vendorDigits = vendorValue.replace(/[^0-9]/g, '');
    const verifiedDigits = verifiedValue.replace(/[^0-9]/g, '');

    // Same digits but different decimal position
    if (vendorDigits === verifiedDigits && vendorValue !== verifiedValue) {
      return 'missing_decimal';
    }

    // Decimal shift detection: ratio is exact power of 10
    if (verifiedNum !== 0) {
      const ratio = Math.abs(vendorNum / verifiedNum);
      const log10Ratio = Math.log10(ratio);

      // True decimal shift: same digits, just decimal point moved
      // e.g., 1450 → 14.50 (digits: 1450 vs 1450)
      // NOT: 1234567 → 12345670 (digits: 1234567 vs 12345670 - extra zero added)
      if (Math.abs(log10Ratio - Math.round(log10Ratio)) < 0.001 && Math.abs(log10Ratio) >= 1) {
        // Only classify as missing_decimal if digits are EXACTLY the same
        // (not just substring match, which could be an added zero)
        if (vendorDigits === verifiedDigits) {
          return 'missing_decimal';
        }
        // Also check: if the difference is just trailing zeros being added/removed
        // e.g., 145 vs 14500 (not a decimal shift, it's magnitude error)
        const digitDiff = Math.abs(vendorDigits.length - verifiedDigits.length);
        if (digitDiff === 0) {
          return 'missing_decimal';
        }
      }

      // Magnitude error: 10x+ difference (extra/missing digits)
      if (ratio >= 9 || ratio <= 0.11) {
        return 'magnitude_error';
      }
    }
  }

  // Small edit distance suggests OCR misread (O vs 0, l vs 1)
  const distance = levenshtein(vendorValue, verifiedValue);
  if (distance <= 2) {
    return 'ocr_misread';
  }

  // Everything else is "completely wrong"
  return 'completely_wrong';
}

// ============================================================================
// Impact Assessment
// ============================================================================

/**
 * Calculate the impact level of a correction
 * Used to prioritize attention without revealing actual values
 */
export function calculateCorrectionImpact(
  vendorValue: string,
  verifiedValue: string
): 'low' | 'medium' | 'high' {
  const vendorNum = parseFinancialNumber(vendorValue);
  const verifiedNum = parseFinancialNumber(verifiedValue);

  // If we can't parse as numbers, use edit distance as proxy
  if (vendorNum === null || verifiedNum === null) {
    const distance = levenshtein(vendorValue, verifiedValue);
    const maxLen = Math.max(vendorValue.length, verifiedValue.length);
    const changeRatio = distance / maxLen;

    if (changeRatio > 0.5) return 'high';
    if (changeRatio > 0.2) return 'medium';
    return 'low';
  }

  // For numeric values, use percent difference
  if (verifiedNum === 0) {
    return vendorNum === 0 ? 'low' : 'high';
  }

  const pctDiff = Math.abs((vendorNum - verifiedNum) / verifiedNum);

  if (pctDiff > 0.05) return 'high';    // >5% difference
  if (pctDiff > 0.01) return 'medium';  // >1% difference
  return 'low';
}

// ============================================================================
// Main Safe Metadata Calculator
// ============================================================================

/**
 * Calculate analytics-safe metadata from raw values
 * This is the main function to use before sending events to PostHog
 *
 * @example
 * const metadata = calculateSafeMetadata(field.suggestedValue, verifiedValue);
 * posthog.capture('field_verified', {
 *   field_id: field.id,
 *   ...metadata,  // Safe: no raw values
 * });
 */
export function calculateSafeMetadata(
  vendorValue: string,
  verifiedValue: string
): VerificationMetadata {
  const wasCorrected = vendorValue !== verifiedValue;

  if (!wasCorrected) {
    return {
      wasCorrected: false,
      correctionType: 'formatting_only',
      levenshteinDistance: 0,
      correctionImpact: 'low',
      magnitudeChange: null,
      keystrokesSaved: verifiedValue.length,  // User saved all keystrokes
    };
  }

  const correctionType = detectCorrectionType(vendorValue, verifiedValue);
  const levenshteinDistance = levenshtein(vendorValue, verifiedValue);
  const correctionImpact = calculateCorrectionImpact(vendorValue, verifiedValue);

  // Calculate magnitude change for numeric values
  let magnitudeChange: number | null = null;
  const vendorNum = parseFinancialNumber(vendorValue);
  const verifiedNum = parseFinancialNumber(verifiedValue);
  if (vendorNum !== null && verifiedNum !== null) {
    magnitudeChange = percentChange(vendorNum, verifiedNum);
  }

  // Keystrokes saved = vendor value length - edit distance
  // (how much typing the vendor OCR saved the user)
  const keystrokesSaved = Math.max(0, verifiedValue.length - levenshteinDistance);

  return {
    wasCorrected,
    correctionType,
    levenshteinDistance,
    correctionImpact,
    magnitudeChange,
    keystrokesSaved,
  };
}

// ============================================================================
// Session Metadata Calculator
// ============================================================================

/**
 * Calculate session-level metadata for PostHog
 * Called when verification session completes
 */
export function calculateSessionMetadata(
  fields: Array<{
    suggestedValue: string;
    verifiedValue: string | null;
    verificationStatus: string;
    verificationTimeMs?: number;
  }>,
  sessionDurationMs: number
): SessionMetadata {
  const totalFields = fields.length;
  let fieldsVerified = 0;
  let fieldsCorrected = 0;
  let fieldsFlagged = 0;
  let fieldsSkipped = 0;
  let totalVerificationTimeMs = 0;

  const correctionsByType: Record<CorrectionType, number> = {
    ocr_misread: 0,
    missing_decimal: 0,
    wrong_sign: 0,
    magnitude_error: 0,
    completely_wrong: 0,
    formatting_only: 0,
  };

  for (const field of fields) {
    if (field.verificationStatus === 'verified') {
      fieldsVerified++;
      if (field.verifiedValue !== null) {
        const metadata = calculateSafeMetadata(
          field.suggestedValue,
          field.verifiedValue
        );
        if (metadata.wasCorrected) {
          fieldsCorrected++;
          correctionsByType[metadata.correctionType]++;
        }
      }
      if (field.verificationTimeMs) {
        totalVerificationTimeMs += field.verificationTimeMs;
      }
    } else if (field.verificationStatus === 'flagged') {
      fieldsFlagged++;
    } else if (field.verificationStatus === 'skipped') {
      fieldsSkipped++;
    }
  }

  const correctionRate = totalFields > 0 ? fieldsCorrected / totalFields : 0;
  const vendorAccuracyRate = totalFields > 0
    ? (totalFields - fieldsCorrected) / totalFields
    : 1;
  const avgFieldTimeMs = fieldsVerified > 0
    ? Math.round(totalVerificationTimeMs / fieldsVerified)
    : 0;
  const fieldsPerMinute = sessionDurationMs > 0
    ? (fieldsVerified / sessionDurationMs) * 60000
    : 0;

  return {
    totalFields,
    fieldsVerified,
    fieldsCorrected,
    fieldsFlagged,
    fieldsSkipped,
    correctionRate,
    vendorAccuracyRate,
    totalDurationMs: sessionDurationMs,
    avgFieldTimeMs,
    fieldsPerMinute: Math.round(fieldsPerMinute * 100) / 100,
    correctionsByType,
  };
}

// ============================================================================
// Confidence Color Mapping (for UI)
// ============================================================================

export function getConfidenceColor(confidence: number): string {
  if (confidence >= 0.9) return '#22c55e';  // Green
  if (confidence >= 0.7) return '#eab308';  // Yellow
  if (confidence >= 0.5) return '#ef4444';  // Red
  return '#1f2937';                          // Black/Dark Gray
}

export function getConfidenceLabel(confidence: number): string {
  if (confidence >= 0.9) return 'High';
  if (confidence >= 0.7) return 'Medium';
  if (confidence >= 0.5) return 'Low';
  return 'Critical';
}

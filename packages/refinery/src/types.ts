/**
 * Financial Data Refinery Types
 * Core types for the "Trust, but Verify" workflow
 */

// ============================================================================
// Vendor Types
// ============================================================================

export interface OcrVendor {
  id: string;
  display_name: string;
  api_endpoint: string | null;
  supports_bounding_box: boolean;
  supports_confidence: boolean;
  cost_per_page: number | null;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export type VendorId = 'llamaparse' | 'aws_textract' | 'gemini' | 'pdfplumber';

// ============================================================================
// Bounding Box Types
// ============================================================================

export interface BoundingBox {
  x: number;      // Left edge (0-1 normalized)
  y: number;      // Top edge (0-1 normalized)
  width: number;  // Width (0-1 normalized)
  height: number; // Height (0-1 normalized)
}

// ============================================================================
// Raw OCR Extraction Types
// ============================================================================

export type ExtractionStatus = 'processing' | 'completed' | 'failed' | 'partial';

export interface RawOcrExtraction {
  id: number;
  document_id: string;
  vendor_name: VendorId;
  raw_json: Record<string, unknown>;
  overall_confidence: number | null;
  page_count: number | null;
  fields_extracted: number;
  processing_time_ms: number | null;
  cost_cents: number | null;
  status: ExtractionStatus;
  error_message: string | null;
  extracted_at: Date;
}

export interface RawOcrExtractionInsert {
  document_id: string;
  vendor_name: VendorId;
  raw_json: Record<string, unknown>;
  overall_confidence?: number;
  page_count?: number;
  fields_extracted?: number;
  processing_time_ms?: number;
  cost_cents?: number;
  status?: ExtractionStatus;
  error_message?: string;
}

// ============================================================================
// Staging Financial Data Types (Core Verification Table)
// ============================================================================

export type VerificationStatus = 'pending' | 'needs_review' | 'verified' | 'flagged' | 'skipped' | 'rejected';

export type CorrectionType =
  | 'ocr_misread'
  | 'missing_decimal'
  | 'wrong_sign'
  | 'magnitude_error'
  | 'completely_wrong'
  | 'formatting_only';

export type FieldCategory =
  | 'income_statement'
  | 'balance_sheet'
  | 'cash_flow'
  | 'notes'
  | 'other';

export type Resolution = 'approved' | 'corrected' | 'needs_source_doc';

export interface StagingFinancialData {
  id: string;
  extraction_id: number;
  document_id: string;

  // Field identification
  field_label: string;
  field_category: FieldCategory | null;
  page_number: number;
  row_index: number | null;

  // Vendor hypothesis
  suggested_value: string;
  suggested_value_numeric: number | null;
  bounding_box: BoundingBox;
  confidence: number;

  // Verification state
  verification_status: VerificationStatus;
  verified_value: string | null;
  verified_value_numeric: number | null;
  verified_by_user_id: string | null;
  verified_at: Date | string | null; // Date from DB, string in Redux for serialization

  // Correction tracking
  was_corrected: boolean;
  correction_type: CorrectionType | null;

  // Flagging
  flag_reason: string | null;
  flagged_by_user_id: string | null;
  flagged_at: Date | string | null; // Date from DB, string in Redux for serialization

  // Rejection
  rejected_at: Date | string | null; // Date from DB, string in Redux for serialization

  // Supervisor resolution
  resolved_by_user_id: string | null;
  resolved_at: Date | string | null; // Date from DB, string in Redux for serialization
  resolution: Resolution | null;

  created_at: Date | string; // Date from DB, string in Redux for serialization
  updated_at: Date | string; // Date from DB, string in Redux for serialization
}

export interface StagingFinancialDataInsert {
  extraction_id: number;
  document_id: string;
  field_label: string;
  field_category?: FieldCategory;
  page_number: number;
  row_index?: number;
  suggested_value: string;
  suggested_value_numeric?: number;
  bounding_box: BoundingBox;
  confidence: number;
}

// ============================================================================
// Verification Session Types
// ============================================================================

export type SessionStatus = 'active' | 'completed' | 'abandoned';

export interface VerificationSession {
  id: string;
  user_id: string;
  document_id: string;
  extraction_id: number | null;

  started_at: Date;
  completed_at: Date | null;
  last_activity_at: Date;
  session_duration_ms: number | null;

  total_fields: number;
  fields_verified: number;
  fields_corrected: number;
  fields_flagged: number;
  fields_skipped: number;

  status: SessionStatus;
  current_field_id: string | null;

  avg_field_time_ms: number | null;
  fields_per_minute: number | null;
}

export interface VerificationSessionInsert {
  user_id: string;
  document_id: string;
  extraction_id?: number;
  total_fields?: number;
}

// ============================================================================
// Audit Ledger Types
// ============================================================================

export type AuditEventType =
  | 'field_verified'
  | 'field_flagged'
  | 'field_skipped'
  | 'field_rejected'
  | 'field_corrected_by_supervisor'
  | 'bulk_accept'
  | 'session_started'
  | 'session_completed';

export type UserRole = 'reviewer' | 'supervisor' | 'admin' | 'system';

export interface VerificationAuditEntry {
  id: number;
  created_at: Date;

  event_type: AuditEventType;
  field_id: string | null;
  document_id: string;
  extraction_id: number | null;

  user_id: string;
  user_role: UserRole;
  ip_address: string | null;
  user_agent: string | null;

  vendor_value: string | null;
  previous_value: string | null;
  new_value: string | null;
  change_reason: string | null;

  session_id: string | null;
  verification_time_ms: number | null;

  vendor_name: string | null;
  vendor_confidence: number | null;

  affected_field_count: number | null;
  confidence_threshold: number | null;
}

export interface VerificationAuditEntryInsert {
  event_type: AuditEventType;
  field_id?: string;
  document_id: string;
  extraction_id?: number;

  user_id: string;
  user_role: UserRole;
  ip_address?: string;
  user_agent?: string;

  vendor_value?: string;
  previous_value?: string;
  new_value?: string;
  change_reason?: string;

  session_id?: string;
  verification_time_ms?: number;

  vendor_name?: string;
  vendor_confidence?: number;

  affected_field_count?: number;
  confidence_threshold?: number;
}

// ============================================================================
// Vendor Performance Types
// ============================================================================

export interface VendorPerformance {
  id: number;
  vendor_id: VendorId;
  document_type: string | null;

  total_fields: number;
  corrected_fields: number;
  accuracy_rate: number | null;
  avg_confidence: number | null;
  avg_verification_time_ms: number | null;

  period_start: Date;
  period_end: Date;

  created_at: Date;
  updated_at: Date;
}

// ============================================================================
// Critical Field Types
// ============================================================================

export interface CriticalFieldDefinition {
  id: number;
  field_label: string;
  field_category: string | null;
  description: string | null;
  is_active: boolean;
  created_at: Date;
}

// ============================================================================
// API Request/Response Types
// ============================================================================

export interface ExtractRequest {
  vendor?: VendorId;
  pages?: number[];
  fieldTypes?: FieldCategory[];
}

export interface ExtractResponse {
  extractionId: number;
  status: ExtractionStatus;
  vendor: VendorId;
  estimatedTime?: number;
}

export interface VerificationQueueResponse {
  fields: StagingFinancialData[];
  summary: {
    total: number;
    pending: number;
    needsReview: number;
    verified: number;
    flagged: number;
    skipped: number;
    rejected: number;
  };
  session: VerificationSession | null;
}

export interface VerifyFieldRequest {
  verifiedValue?: string;
  status?: 'verified' | 'flagged' | 'skipped' | 'rejected';
  flagReason?: string;
  rejectionReason?: string;
  verificationTimeMs?: number;
}

export interface BulkVerifyRequest {
  confidenceThreshold: number;
  fieldIds?: string[];
  excludeCriticalFields?: boolean;
}

export interface BulkVerifyResponse {
  acceptedCount: number;
  skippedCount: number;
  skippedFields: Array<{
    id: string;
    reason: 'critical_field' | 'below_threshold';
  }>;
}

export interface ExportVerifiedRequest {
  format: 'xlsx' | 'csv' | 'json';
  includeAuditTrail?: boolean;
  includeConfidence?: boolean;
}

// ============================================================================
// Confidence Thresholds (from spec)
// ============================================================================

export const CONFIDENCE_THRESHOLDS = {
  HIGH: 0.9,    // Green - quick review, likely correct
  MEDIUM: 0.7,  // Yellow - needs attention
  LOW: 0.5,     // Red - likely wrong, force verification
  CRITICAL: 0,  // Black - vendor couldn't extract
} as const;

export type ConfidenceLevel = 'high' | 'medium' | 'low' | 'critical';

export function getConfidenceLevel(confidence: number): ConfidenceLevel {
  if (confidence >= CONFIDENCE_THRESHOLDS.HIGH) return 'high';
  if (confidence >= CONFIDENCE_THRESHOLDS.MEDIUM) return 'medium';
  if (confidence >= CONFIDENCE_THRESHOLDS.LOW) return 'low';
  return 'critical';
}


/**
 * Checks if the given ID is an OCR Job ID.
 * OCR Job IDs are prefixed with 'ocr-'.
 */
export function isOcrJobId(id: string): boolean {
  return id.startsWith('ocr-');
}

/**
 * Checks if the given ID is a valid UUID (used for User Documents).
 */
export function isDocumentId(id: string): boolean {
  // Simple regex for UUID v4
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(id);
}

export type ResourceType = 'document' | 'ocr_job' | 'unknown';

export function getResourceType(id: string): ResourceType {
  if (isOcrJobId(id)) return 'ocr_job';
  if (isDocumentId(id)) return 'document';
  return 'unknown';
}

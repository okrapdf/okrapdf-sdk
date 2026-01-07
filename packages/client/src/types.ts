export interface OkraDocument {
  uuid: string;
  file_name: string;
  file_size: number | null;
  upload_date: string;
  verification_status: string | null;
  verification_progress: number | null;
  tables_count: number;
  outputs_count: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  next_page?: string;
  total?: number;
}

export interface ApiError {
  error: string;
  details?: string;
}

export interface ClientConfig {
  apiKey?: string;
  baseUrl?: string;
}

// Upload types
export interface UploadResponse {
  success: boolean;
  documentUuid: string;
  documentId: number;
  uploadDate: string;
}

// Chat Types
export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatResponse {
  text: string;
  groundingMetadata?: any; // Google GenAI metadata structure
}

export interface ProvisionStoreResponse {
  success: boolean;
  storeName: string;
}

// Extraction Types
// We reuse types from @okrapdf/refinery where possible, but the API might return a specific wrapper
export interface ExtractionResult {
  results: any[]; // Vision OCR format
  requestId: string;
  processedCount: number;
  processorType: string | null;
  cached: boolean;
}

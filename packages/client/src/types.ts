/**
 * @deprecated OkraDocument is being superseded by OcrJob. Use OcrJob where possible.
 */
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

export interface OcrJob {
  id: string; // prefixed with 'ocr-'
  status: 'pending' | 'processing' | 'completed' | 'failed';
  created_at: string;
  file_name?: string; // Optional as it might not be persisted the same way
  error_message?: string;
}

export type DocumentOrJob = OkraDocument | OcrJob;

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
  bucketName?: string;
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

// ============================================================================
// Verification Tree Types (for CLI tree command)
// ============================================================================

export type VerificationPageStatus =
  | 'complete'
  | 'partial'
  | 'flagged'
  | 'pending'
  | 'empty'
  | 'gap'
  | 'error';

export interface VerificationTreePage {
  page: number;
  status: VerificationPageStatus;
  total: number;
  verified: number;
  pending: number;
  flagged: number;
  rejected: number;
  avgConfidence: number;
  hasOcr: boolean;
  ocrLineCount: number;
  hasCoverageGaps: boolean;
  uncoveredCount: number;
  resolution: string | null;
  classification: string | null;
  isStale: boolean;
}

export interface VerificationTreeSummary {
  complete: number;
  partial: number;
  flagged: number;
  pending: number;
  empty: number;
  gap: number;
  resolved?: number;
  stale?: number;
}

export interface VerificationTreeResponse {
  jobId: string;
  documentId: string;
  totalPages: number;
  summary: VerificationTreeSummary;
  pages: VerificationTreePage[];
}

// ============================================================================
// Entity Types (for CLI find command)
// ============================================================================

export type EntityType = 'table' | 'figure' | 'footnote' | 'summary' | 'signature' | 'paragraph';

export interface EntityBBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Entity {
  id: string;
  type: EntityType;
  title: string | null;
  page: number;
  schema?: string[];
  isComplete?: boolean;
  bbox?: EntityBBox;
  confidence?: number;
  verificationStatus?: 'pending' | 'verified' | 'flagged' | 'rejected';
}

export interface EntitiesResponse {
  jobId: string;
  entities: Entity[];
  counts: {
    tables: number;
    figures: number;
    footnotes: number;
    summaries: number;
    signatures?: number;
  };
  extractionStatus?: string;
  totalPages?: number;
}

// ============================================================================
// Page Content Types (for CLI page command)
// ============================================================================

export interface TextBlock {
  text: string;
  bbox?: EntityBBox;
  confidence?: number;
}

export interface PageDimension {
  width: number | null;
  height: number | null;
}

export interface PageContentResponse {
  page: number;
  content: string;
  version?: number;
  blocks?: TextBlock[];
  dimension?: PageDimension | null;
}

export interface SavePageVersionResponse {
  success: boolean;
  page: number;
  version: number;
}

export interface ResolvePageRequest {
  resolution: string;
  classification?: string;
  reason?: string;
}

export interface PageVersionInfo {
  version: number;
  edit_source: 'ocr_extraction' | 'user_edit' | 'ai_correction';
  created_at: string | null;
  preview: string;
}

export interface PageVersionsResponse {
  page: number;
  current_version: number;
  versions: PageVersionInfo[];
}

// ============================================================================
// Table Types (for CLI tables command)
// ============================================================================

export interface TableRecord {
  id: string;
  page_number: number;
  markdown: string;
  bbox: { xmin: number; ymin: number; xmax: number; ymax: number };
  confidence: number | null;
  verification_status: 'pending' | 'verified' | 'flagged' | 'rejected';
  verified_by: string | null;
  verified_at: string | null;
  was_corrected?: boolean;
  created_at: string;
}

export interface TablesResponse {
  tables: TableRecord[];
  source: 'job_id' | 'document_uuid';
}

// ============================================================================
// Search Types (for CLI search command)
// ============================================================================

export type MatchSource = 'content' | 'table_title' | 'table_schema' | 'table_row' | 'figure' | 'footnote' | 'summary' | 'signature' | 'paragraph';

export interface SearchResult {
  page: number;
  snippet: string;
  match_count: number;
  match_source?: MatchSource;
}

export interface SearchResponse {
  query: string;
  total_matches: number;
  results: SearchResult[];
}

// ============================================================================
// History Types (for CLI history command)
// ============================================================================

export interface HistoryEntry {
  id: string;
  entityType: string;
  entityId: string;
  state: string;
  previousState: string | null;
  transitionName: string | null;
  triggeredBy: string | null;
  triggeredByName: string | null;
  reason: string | null;
  resolution: string | null;
  classification: string | null;
  pageNum: number | null;
  createdAt: string;
}

export interface HistoryResponse {
  history: HistoryEntry[];
}

// ============================================================================
// Extraction Provider Types (for BYOK/local and remote modes)
// ============================================================================

export type ExtractionMode = 'local' | 'remote';
export type ExtractionProviderStatus = 'idle' | 'extracting' | 'completed' | 'failed';

export interface ExtractionProgress {
  phase: 'text' | 'tables' | 'entities' | 'metadata';
  currentPage: number;
  totalPages: number;
  status: 'processing' | 'completed' | 'failed';
  message?: string;
  error?: string;
}

export interface ExtractionProviderConfig {
  mode: ExtractionMode;
  workspaceId: string;
  workspacePath?: string;
  jobId?: string;
  apiKey?: string;
}

export interface ExtractionProvider {
  mode: ExtractionMode;
  status: ExtractionProviderStatus;
  progress: ExtractionProgress | null;
  totalPages: number;

  initialize(config: ExtractionProviderConfig): Promise<void>;
  startExtraction(): Promise<void>;
  cancelExtraction(): void;

  getPageContent(page: number): Promise<PageContentResponse | null>;
  getPageContents(pages: number[]): Promise<PageContentResponse[]>;
  savePageContent(page: number, content: string): Promise<SavePageVersionResponse>;

  getTables(): Promise<TableRecord[]>;
  getTablesByPage(page: number): Promise<TableRecord[]>;
  updateTableStatus(tableId: string, status: 'pending' | 'verified' | 'flagged' | 'rejected'): Promise<void>;
  updateTableMarkdown(tableId: string, markdown: string): Promise<void>;

  getEntities(): Promise<Entity[]>;
  getEntitiesByPage(page: number): Promise<Entity[]>;

  onProgress(callback: (event: ExtractionProgress) => void): () => void;
}

// ============================================================================
// Local Workspace Types (for BYOK mode file storage)
// ============================================================================

export interface LocalWorkspace {
  id: string;
  name: string;
  pdfPath: string;
  workspacePath: string;
  createdAt: string;
  lastOpenedAt: string;
  pageCount?: number;
  extractionStatus: 'pending' | 'extracting' | 'completed' | 'failed';
  extractionProgress?: number;
}

export interface LocalWorkspaceMetadata {
  id: string;
  fileName: string;
  originalPath: string;
  createdAt: string;
  mode: 'local';
  pageCount?: number;
  extractionStatus: 'pending' | 'extracting' | 'completed' | 'failed';
  textExtractionComplete?: boolean;
  tableExtractionComplete?: boolean;
}

export interface LocalTableState {
  id: string;
  page: number;
  status: 'pending' | 'verified' | 'flagged' | 'rejected';
  markdown: string;
  bbox?: { xmin: number; ymin: number; xmax: number; ymax: number };
  confidence?: number;
  versions: LocalTableVersion[];
  lastModified: string;
}

export interface LocalTableVersion {
  id: string;
  markdown: string;
  source: 'extraction' | 'user_edit' | 'ai_correction';
  createdAt: string;
  editNote?: string;
}

export interface LocalVerificationState {
  version: 1;
  jobId: string;
  documentName: string;
  totalPages: number;
  pages: Record<number, LocalPageState>;
  tables: Record<string, LocalTableState>;
  lastModified: string;
}

export interface LocalPageState {
  page: number;
  status: 'pending' | 'verified' | 'flagged' | 'rejected';
  hasOcr: boolean;
  ocrLineCount: number;
  entities: LocalEntityInfo[];
  resolution?: string;
  classification?: string;
  lastModified: string;
}

export interface LocalEntityInfo {
  id: string;
  type: EntityType;
  title?: string;
  page: number;
  bbox?: EntityBBox;
}

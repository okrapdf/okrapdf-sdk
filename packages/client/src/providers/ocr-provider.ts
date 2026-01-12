/**
 * OCR Provider Interface
 *
 * Abstracts different OCR/document extraction engines (Google Doc AI, OpenRouter VLM,
 * Docling, Marker, etc.) behind a common interface. Enables:
 * - Provider switching at runtime
 * - Side-by-side comparison mode
 * - Pluggable architecture for new engines
 *
 * Inspired by Docling's factory + plugin pattern.
 */

// ============================================================================
// Provider ID Types
// ============================================================================

export type OcrProviderId =
  | 'google-docai' // Google Document AI (bboxes, layout)
  | 'openrouter' // OpenRouter VLM (Qwen, Claude, etc.)
  | 'mistral-ocr' // Mistral OCR API
  | 'docling' // IBM Docling (local Python)
  | 'marker' // Marker PDF (local Python)
  | 'surya' // Surya OCR (local Python)
  | 'tesseract' // Tesseract (local binary)
  | 'easyocr' // EasyOCR (local Python)
  | 'aws-textract' // AWS Textract
  | 'llamaparse'; // LlamaIndex LlamaParse

export type OcrProviderRuntime = 'api' | 'python' | 'binary' | 'wasm';

// ============================================================================
// Capability Types
// ============================================================================

export interface OcrProviderCapabilities {
  /** Extracts text content */
  supportsText: boolean;
  /** Extracts tables with structure */
  supportsTables: boolean;
  /** Returns bounding boxes for layout overlay */
  supportsBboxes: boolean;
  /** Extracts figures/images */
  supportsFigures: boolean;
  /** Handles handwritten text */
  supportsHandwriting: boolean;
  /** Supports multiple languages */
  supportsMultiLanguage: boolean;
  /** Available output formats */
  outputFormats: ('markdown' | 'json' | 'html')[];
  /** Max pages per request (null = unlimited) */
  maxPagesPerRequest: number | null;
}

// ============================================================================
// Configuration Types
// ============================================================================

export interface OcrProviderConfig {
  /** API key for cloud providers */
  apiKey?: string;
  /** Custom endpoint URL */
  endpoint?: string;
  /** Model ID (for providers with multiple models) */
  modelId?: string;
  /** Python path for local providers */
  pythonPath?: string;
  /** GCP project ID (for Google Doc AI) */
  projectId?: string;
  /** Processor name (for Google Doc AI) */
  processorId?: string;
  /** Provider-specific options */
  options?: Record<string, unknown>;
}

// ============================================================================
// Result Types
// ============================================================================

/**
 * Bounding box in normalized coordinates (0-1 range).
 * Compatible with Google Doc AI's normalizedVertices format.
 */
export interface OcrBoundingBox {
  /** Block type classification */
  type: 'text' | 'table' | 'figure' | 'heading' | 'list' | 'paragraph';
  /** Normalized vertices (0-1 coordinates) */
  vertices: Array<{ x: number; y: number }>;
  /** Extracted text content */
  text?: string;
  /** Confidence score (0-1) */
  confidence?: number;
  /** Block ID for reference */
  id?: string;
}

/**
 * Table data with structure preserved.
 */
export interface OcrTableData {
  /** Table ID */
  id: string;
  /** Markdown representation */
  markdown: string;
  /** Bounding box */
  bbox?: OcrBoundingBox;
  /** Column headers if detected */
  headers?: string[];
  /** Row count */
  rowCount?: number;
  /** Column count */
  colCount?: number;
}

/**
 * Figure/image data.
 */
export interface OcrFigureData {
  /** Figure ID */
  id: string;
  /** Caption if detected */
  caption?: string;
  /** Bounding box */
  bbox?: OcrBoundingBox;
  /** Base64 encoded image data */
  imageData?: string;
}

/**
 * Result for a single page extraction.
 */
export interface OcrPageResult {
  /** Page number (1-indexed) */
  pageNumber: number;
  /** Markdown text content */
  markdown?: string;
  /** Bounding boxes for overlay visualization */
  bboxes: OcrBoundingBox[];
  /** Extracted tables */
  tables?: OcrTableData[];
  /** Extracted figures */
  figures?: OcrFigureData[];
  /** Overall page confidence */
  confidence?: number;
  /** Provider-specific raw output */
  rawOutput?: unknown;
  /** Processing duration in ms */
  durationMs?: number;
}

// ============================================================================
// Progress Types
// ============================================================================

export type OcrProgressStatus =
  | 'initializing'
  | 'processing'
  | 'complete'
  | 'error'
  | 'cancelled';

export interface OcrProgress {
  /** Provider being used */
  providerId: OcrProviderId;
  /** Current page being processed */
  currentPage: number;
  /** Total pages to process */
  totalPages: number;
  /** Current status */
  status: OcrProgressStatus;
  /** Human-readable message */
  message?: string;
  /** Error details if status is 'error' */
  error?: string;
}

// ============================================================================
// Provider Interface
// ============================================================================

/**
 * Core OCR provider interface.
 * All OCR engines must implement this interface.
 */
export interface OcrProvider {
  /** Unique provider identifier */
  readonly id: OcrProviderId;
  /** Human-readable name */
  readonly name: string;
  /** Runtime type (api, python, binary, wasm) */
  readonly runtime: OcrProviderRuntime;
  /** Provider capabilities */
  readonly capabilities: OcrProviderCapabilities;

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  /**
   * Check if provider is available (deps installed, API key set, etc.)
   */
  isAvailable(): boolean;

  /**
   * Initialize provider with configuration.
   * Must be called before extraction.
   */
  initialize(config: OcrProviderConfig): Promise<void>;

  /**
   * Cleanup resources.
   */
  dispose(): Promise<void>;

  /**
   * Health check - verify provider can connect and process.
   */
  checkHealth(): Promise<{ ok: boolean; error?: string; latencyMs?: number }>;

  // ---------------------------------------------------------------------------
  // Extraction
  // ---------------------------------------------------------------------------

  /**
   * Extract a single page from an image buffer.
   */
  extractPage(imageBuffer: Buffer, pageNumber: number): Promise<OcrPageResult>;

  /**
   * Extract all pages from a PDF.
   * Returns an async generator for streaming results.
   */
  extractDocument(
    pdfBuffer: Buffer,
    options?: { startPage?: number; endPage?: number }
  ): AsyncGenerator<OcrPageResult>;

  // ---------------------------------------------------------------------------
  // Progress
  // ---------------------------------------------------------------------------

  /**
   * Subscribe to progress updates.
   * Returns unsubscribe function.
   */
  onProgress(callback: (progress: OcrProgress) => void): () => void;
}

// ============================================================================
// Metadata Types (for registry)
// ============================================================================

export interface OcrProviderMetadata {
  /** Provider ID */
  id: OcrProviderId;
  /** Display name */
  name: string;
  /** Description */
  description: string;
  /** Runtime type */
  runtime: OcrProviderRuntime;
  /** Capabilities */
  capabilities: OcrProviderCapabilities;
  /** JSON Schema for config UI */
  configSchema: Record<string, unknown>;
  /** Installation instructions (for local providers) */
  installInstructions?: string;
  /** Documentation URL */
  documentationUrl?: string;
  /** Cost per page (null = free/local) */
  costPerPage?: number | null;
  /** Whether this is a cloud/API provider */
  isCloud: boolean;
}

// ============================================================================
// Factory Types
// ============================================================================

export type OcrProviderFactory = (config: OcrProviderConfig) => OcrProvider;

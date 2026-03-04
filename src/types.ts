import type { ZodType } from 'zod';

export type JsonSchema = Record<string, unknown>;

export type StructuredOutputErrorCode =
  | 'SCHEMA_VALIDATION_FAILED'
  | 'EXTRACTION_FAILED'
  | 'TIMEOUT'
  | 'DOCUMENT_NOT_FOUND';

export type RuntimeErrorCode =
  | StructuredOutputErrorCode
  | 'INVALID_REQUEST'
  | 'UNAUTHORIZED'
  | 'HTTP_ERROR'
  | 'INVALID_RESPONSE';

export interface OkraClientOptions {
  /** Hosted default points at api.okrapdf.com. */
  baseUrl?: string;
  /** Bearer API key (okra_...). */
  apiKey?: string;
  /** Alternative auth header (e.g. worker-to-worker shared secret). */
  sharedSecret?: string;
  /** Inject custom fetch implementation for tests or runtime overrides. */
  fetch?: typeof globalThis.fetch;
}

export interface UploadRedactPiiOptions {
  preset?: string;
  patterns?: string[];
  includeNames?: boolean;
  includeAddresses?: boolean;
  customPatterns?: Array<Record<string, unknown>>;
  [key: string]: unknown;
}

export interface UploadRedactOptions {
  pii?: UploadRedactPiiOptions;
  publicFieldAllowlist?: string[];
  [key: string]: unknown;
}

export interface UploadOptions {
  /** Provide your own document ID. Default: auto-generated `doc-*`. */
  documentId?: string;
  /** Optional filename hint for binary uploads. */
  fileName?: string;
  /** Processing capability hints forwarded to the worker. */
  capabilities?: Record<string, unknown>;
  /** Document visibility. 'private' (default) requires auth; 'public' auto-publishes on completion. */
  visibility?: 'public' | 'private';
  /** BYOK vendor keys passed through to extraction (e.g. { llamaparse: 'llx-...' }). Stateless — never stored. */
  vendorKeys?: Record<string, string>;
  /** OpenRedact policy forwarded to upload and enforced at read/query/completion surfaces. */
  redact?: UploadRedactOptions;
}

export type UploadInput = string | ArrayBuffer | Uint8Array | Blob;

export interface DocumentStatus {
  phase: string;
  pagesTotal?: number;
  pagesCompleted?: number;
  totalNodes?: number;
  verifiedNodes?: number;
  failedNodes?: number;
  pendingNodes?: number;
  [key: string]: unknown;
}

export interface WaitOptions {
  timeoutMs?: number;
  pollIntervalMs?: number;
  signal?: AbortSignal;
}

export interface StructuredOutputMeta {
  confidence: number;
  model: string;
  durationMs: number;
  citations?: Array<{ page: number; text: string }>;
}

export type StructuredSchema<T> = JsonSchema | ZodType<T>;

// ─── Pages / Entities / Query ────────────────────────────────────────────────

export interface PageBlock {
  text: string;
  bbox?: { x: number; y: number; width: number; height: number };
  confidence?: number;
}

export interface PageEntity {
  id: string;
  type: string;
  label: string | null;
}

export interface Page {
  page: number;
  content: string;
  blocks: PageBlock[];
  entities: PageEntity[];
}

export interface Entity {
  id: string;
  type: string;
  label: string | null;
  value: string | null;
  page_number: number | null;
  status: string;
  bbox_x?: number | null;
  bbox_y?: number | null;
  bbox_w?: number | null;
  bbox_h?: number | null;
  metadata?: string | null;
}

export interface EntitiesResponse {
  nodes: Entity[];
  total?: number;
  limit?: number;
  offset?: number;
}

export interface QueryResult {
  rows: Record<string, unknown>[];
  columns: string[];
}

// ─── Logs ─────────────────────────────────────────────────────────────────────

export interface LogEntry {
  seq: number;
  event: string;
  actor_type: string;
  actor_id: string;
  target_id: string | null;
  detail: string;
  created_at: number;
  prev_hash: string;
  chain_hash: string;
}

export interface LogsOptions {
  limit?: number;
  signal?: AbortSignal;
}

// ─── Completion / Chat (OpenAI SSE format) ───────────────────────────────────

/** A single SSE chunk from the OpenAI streaming response. */
export interface OpenAIStreamChunk {
  id: string;
  object: 'chat.completion.chunk';
  created: number;
  model: string;
  choices: Array<{
    index: number;
    delta: { role?: string; content?: string };
    finish_reason: string | null;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/** Events yielded by `session.stream()` / `client.stream()`. */
export type CompletionEvent =
  | { type: 'text_delta'; text: string }
  | { type: 'done'; answer: string; costUsd?: number; sources?: Array<{ page: number; snippet: string }> }
  | { type: 'error'; message: string };

export interface CompletionOptions {
  stream?: boolean;
  model?: string;
  signal?: AbortSignal;
}

// ─── Generate (non-streaming AI) ─────────────────────────────────────────────

export interface GenerateOptions {
  schema?: StructuredSchema<unknown>;
  model?: string;
  timeoutMs?: number;
  signal?: AbortSignal;
}

export interface GenerateResult<T = undefined> {
  answer: string;
  sources?: Array<{ page: number; snippet: string }>;
  costUsd?: number;
  /** Present when schema is provided. */
  data?: T;
  /** Present when schema is provided. */
  meta?: StructuredOutputMeta;
}

// ─── Sessions (document handles) ────────────────────────────────────────────

export interface SessionCreateOptions {
  /** Wait for extraction to complete before returning the session handle. Default: true */
  wait?: boolean;
  /** Default model used by prompt()/stream() unless overridden per call. */
  model?: string;
  /** Upload options used when source is URL/path/file (not an existing doc ID). */
  upload?: UploadOptions;
  /** Wait options used when `wait` is enabled. */
  waitOptions?: WaitOptions;
}

export interface SessionAttachOptions {
  /** Default model used by prompt()/stream() unless overridden per call. */
  model?: string;
}

export interface SessionState {
  id: string;
  model?: string;
  modelEndpoint: string;
}

export interface OkraSession {
  readonly id: string;
  readonly modelEndpoint: string;
  readonly model?: string;
  state(): SessionState;
  setModel(model: string): Promise<void>;
  status(signal?: AbortSignal): Promise<DocumentStatus>;
  wait(options?: WaitOptions): Promise<DocumentStatus>;
  pages(options?: { range?: string; signal?: AbortSignal }): Promise<Page[]>;
  page(pageNumber: number, signal?: AbortSignal): Promise<Page>;
  entities(options?: { type?: string; limit?: number; offset?: number; signal?: AbortSignal }): Promise<EntitiesResponse>;
  downloadUrl(): string;
  query(sql: string, signal?: AbortSignal): Promise<QueryResult>;
  logs(options?: LogsOptions): Promise<LogEntry[]>;
  publish(signal?: AbortSignal): Promise<PublishResult>;
  shareLink(options?: ShareLinkOptions): Promise<ShareLinkResult>;
  prompt(
    query: string,
    options?: GenerateOptions & { schema?: undefined },
  ): Promise<GenerateResult>;
  prompt<T>(
    query: string,
    options: GenerateOptions & { schema: StructuredSchema<T> },
  ): Promise<GenerateResult<T>>;
  stream(
    query: string,
    options?: CompletionOptions,
  ): AsyncGenerator<CompletionEvent>;
}

// ─── Publish / Share ─────────────────────────────────────────────────────────

export interface PublishResult {
  published: boolean;
  documentId: string;
  version: string;
  publicUrl: string;
  /** Immutable public URL: https://api.okrapdf.com/v1/documents/{id} */
  url: string;
  hash: string;
  slug: string;
  canonicalPath: string;
}

export interface ShareLinkOptions {
  /** Link role: 'viewer' (redacted/PDF access), 'admin' (full access), or 'ask' (public completion). */
  role?: 'viewer' | 'ask' | 'admin';
  label?: string;
  expiresInMs?: number;
  maxViews?: number;
  signal?: AbortSignal;
}

export interface ShareLinkLinks {
  markdown: string | null;
  pdf: string | null;
  completion: string | null;
}

export interface ShareLinkCapabilities {
  canViewPdf: boolean;
}

export interface ShareLinkResult {
  documentId: string;
  token: string;
  tokenHint: string;
  links: ShareLinkLinks;
  capabilities: ShareLinkCapabilities;
  role: string;
  expiresAt: number;
  maxViews: number | null;
}

// ─── Collections (map-reduce query + ai-sdk completions) ─────────────────────
//
// Canonical Zod schemas: @okrapdf/schemas/collection-query + @okrapdf/schemas/collection
// These plain TS types mirror the schema shapes for the published SDK.

/** NDJSON events emitted by `client.collections.query()`.
 *  Mirrors `CollectionQueryEvent` in `@okrapdf/schemas`. */
export type CollectionQueryEvent =
  | { type: 'start'; query_id: string; prompt: string; doc_count: number }
  | { type: 'text_delta'; query_id: string; doc_id: string; text: string }
  | { type: 'result'; query_id: string; doc_id: string; status: 'fulfilled' | 'failed' | 'timeout'; answer: string; error?: string; data?: Record<string, unknown>; usage: { cost_usd: number }; duration_ms: number }
  | { type: 'done'; query_id: string; completed: number; failed: number; total_cost_usd: number }
  | { type: 'error'; query_id: string; error: string };

/** Options for `client.collections.query()` — the map-reduce fan-out path. */
export interface CollectionQueryOptions<T = undefined> {
  /** JSON Schema or Zod schema for structured extraction per document.
   *  When provided, each result includes a typed `data` field. */
  schema?: StructuredSchema<T>;
  /** Subset of document IDs to query. Omit to query all docs in collection. */
  docIds?: string[];
  signal?: AbortSignal;
}

/** Per-document answer in a gathered collection query result. */
export interface DocumentAnswer<T = undefined> {
  docId: string;
  status: 'fulfilled' | 'failed' | 'timeout';
  /** Free-text answer (empty string for structured-only queries). */
  answer: string;
  /** Structured extraction output — present when query included a schema. */
  data?: T;
  costUsd: number;
  durationMs: number;
  error?: string;
}

/** Aggregated result from `CollectionQueryStream.gather()`. */
export interface CollectionQueryResult<T = undefined> {
  queryId: string;
  prompt: string;
  answers: Map<string, DocumentAnswer<T>>;
  totalCostUsd: number;
  durationMs: number;
  completed: number;
  failed: number;
}

/**
 * Lazy stream handle returned by `client.collections.query()`.
 *
 * Two consumption modes:
 *   - Iterate for real-time per-doc events (spreadsheet UIs)
 *   - `.gather()` to await all results (scripts, pipelines)
 */
export interface CollectionQueryStream<T = undefined> extends AsyncIterable<CollectionQueryEvent> {
  /** Wait for all documents to complete and return the aggregated result. */
  gather(): Promise<CollectionQueryResult<T>>;
  /** Cancel the in-flight query. */
  abort(): void;
  /** Expose the underlying NDJSON body as a ReadableStream (for proxying). */
  toReadableStream(): ReadableStream<Uint8Array>;
}

// ─── Collection metadata ─────────────────────────────────────────────────────

/** A document summary inside a collection listing. */
export interface CollectionDocument {
  id: string;
  file_name: string;
  phase: string;
  pages_total: number;
  total_nodes: number;
  added_at: string;
  source: string;
}

/** Full collection metadata returned by `client.collections.get()`. */
export interface Collection {
  id: string;
  name: string;
  description: string | null;
  document_count: number;
  visibility: 'public' | 'private';
  user_id: string;
  created_at: string;
  documents: CollectionDocument[];
}

/** Summary row returned by `client.collections.list()`. */
export interface CollectionSummary {
  id: string;
  name: string;
  description: string | null;
  document_count: number;
}

// ─── Collections namespace (client.collections) ─────────────────────────────

export interface OkraCollections {
  // ── CRUD ──

  /** List all collections for the authenticated user. */
  list(signal?: AbortSignal): Promise<CollectionSummary[]>;

  /** Get a single collection with its documents. */
  get(collectionId: string, signal?: AbortSignal): Promise<Collection>;

  // ── map-reduce: fan-out prompt → N docs → N independent answers ──

  /** Unstructured fan-out — each doc answers independently via NDJSON stream. */
  query(
    collectionId: string,
    prompt: string,
    options?: CollectionQueryOptions,
  ): CollectionQueryStream;
  /** Structured fan-out — each doc extracts typed data matching the schema. */
  query<T>(
    collectionId: string,
    prompt: string,
    options: CollectionQueryOptions<T> & { schema: StructuredSchema<T> },
  ): CollectionQueryStream<T>;

  // ── ai-sdk completions: collection-as-model → 1 synthesized answer ──

  /** Streaming completion — collection acts as a single model endpoint.
   *  Returns the same `CompletionEvent` stream as `session.stream()`,
   *  so it plugs directly into AI SDK providers. */
  stream(
    collectionId: string,
    query: string,
    options?: CompletionOptions,
  ): AsyncGenerator<CompletionEvent>;

  /** Non-streaming completion — returns a single synthesized answer. */
  prompt(
    collectionId: string,
    query: string,
    options?: GenerateOptions & { schema?: undefined },
  ): Promise<GenerateResult>;
  /** Non-streaming structured completion — returns typed data. */
  prompt<T>(
    collectionId: string,
    query: string,
    options: GenerateOptions & { schema: StructuredSchema<T> },
  ): Promise<GenerateResult<T>>;
}

// ─── Delivery Transforms ─────────────────────────────────────────────────────

/** Delivery transform options for image resizing/processing (maps to CF Image Resizing). */
export interface DeliveryTransform {
  w?: number;
  h?: number;
  dpr?: number;
  q?: number;
  f?: 'auto' | 'webp' | 'avif' | 'jpeg' | 'png';
  md?: 'copyright' | 'keep' | 'none';
  c?: 'scale-down' | 'contain' | 'cover' | 'crop' | 'pad' | 'squeeze';
  g?: 'auto' | 'face' | 'left' | 'right' | 'top' | 'bottom' | 'center';
  zm?: number;
  bl?: number;
  sh?: number;
  br?: number;
  co?: number;
  sa?: number;
  r?: number;
  fl?: 'h' | 'v' | 'hv';
  bg?: string;
  anim?: boolean;
  seg?: 'foreground';
}

// ─── URL Builder ─────────────────────────────────────────────────────────────

export interface UrlBuilderOptions {
  format?: 'json' | 'csv' | 'html' | 'markdown' | 'png';
  include?: string[];
  /** Provider transformation — changes extraction source, e.g. 'llamaparse', 'googleocr'. */
  provider?: string;
  /** Delivery transform for image resizing/processing. */
  transform?: DeliveryTransform;
}

export interface DocUrlOptions {
  /**
   * Original source filename used to build friendly artifact URLs, e.g.
   * /.../invoice.json
   */
  fileName?: string;
  /**
   * Default provider transformation applied to all URLs from this builder.
   * Cloudinary-style: `/t_llamaparse/pages/1.md` vs `/t_googleocr/pages/1.json`
   */
  provider?: string;
  /**
   * Default image placeholder type when page image is not yet available.
   * Inserts `/d_{type}/` segment. e.g. 'shimmer' → `/d_shimmer/pages/1/image.png`
   */
  defaultImage?: string;
  /**
   * Friendly alias for `defaultImage`. Placeholder for images not yet rendered.
   * 'shimmer' | 'auto' | 'color:hex'. Inserts `/d_{placeholder}/` segment.
   */
  placeholder?: string;
  /** Output schema name — inserts `/o_{schema}/` segment. */
  output?: string;
}

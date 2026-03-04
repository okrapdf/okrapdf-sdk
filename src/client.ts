import { z, type ZodType } from 'zod';
import { OkraRuntimeError, StructuredOutputError } from './errors';
import type {
  OkraClientOptions,
  Collection,
  CollectionSummary,
  CompletionEvent,
  CompletionOptions,
  DocumentStatus,
  EntitiesResponse,
  GenerateOptions,
  GenerateResult,
  JsonSchema,
  LogEntry,
  LogsOptions,
  Page,
  PublishResult,
  QueryResult,
  RuntimeErrorCode,
  ShareLinkOptions,
  ShareLinkResult,
  SessionAttachOptions,
  SessionCreateOptions,
  SessionState,
  OkraSession,
  StructuredOutputErrorCode,
  StructuredSchema,
  UploadInput,
  UploadOptions,
  WaitOptions,
} from './types';

const DEFAULT_BASE_URL = 'https://api.okrapdf.com';
const DEFAULT_WAIT_TIMEOUT_MS = 5 * 60_000;
const DEFAULT_WAIT_POLL_MS = 1_500;
const COMPLETE_PHASES = new Set(['complete', 'awaiting_review']);
const TERMINAL_ERROR_PHASES = new Set(['error']);
const STRUCTURED_CODES = new Set<StructuredOutputErrorCode>([
  'SCHEMA_VALIDATION_FAILED',
  'EXTRACTION_FAILED',
  'TIMEOUT',
  'DOCUMENT_NOT_FOUND',
]);
const NODE_FS_PROMISES_SPECIFIER = `node:${'fs/promises'}`;
const NODE_PATH_SPECIFIER = `node:${'path'}`;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

function isDocumentId(value: string): boolean {
  return /^(?:ocr|doc)-[A-Za-z0-9_-]+$/.test(value);
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '');
}

function makeDocId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `doc-${crypto.randomUUID().replace(/-/g, '').slice(0, 20)}`;
  }
  const rand = Math.random().toString(36).slice(2, 22);
  return `doc-${rand}`;
}

function toUint8Array(input: ArrayBuffer | Uint8Array): Uint8Array {
  if (input instanceof Uint8Array) return input;
  return new Uint8Array(input);
}

interface NodeFsModule {
  readFile(path: string): Promise<ArrayBuffer | Uint8Array>;
}

interface NodePathModule {
  basename(path: string): string;
}

interface NamedBlob extends Blob {
  name?: string;
}

function isBlobLike(input: unknown): input is Blob {
  if (typeof Blob !== 'undefined' && input instanceof Blob) return true;
  return !!input
    && typeof input === 'object'
    && typeof (input as { arrayBuffer?: unknown }).arrayBuffer === 'function';
}

function inferBlobName(input: Blob, fallback: string): string {
  const named = input as NamedBlob;
  if (typeof named.name === 'string' && named.name.trim() !== '') {
    return named.name;
  }
  return fallback;
}

async function readLocalFileFromNode(inputPath: string): Promise<{ bytes: Uint8Array; fileName: string }> {
  try {
    const [fsModule, pathModule] = await Promise.all([
      import(NODE_FS_PROMISES_SPECIFIER) as Promise<NodeFsModule>,
      import(NODE_PATH_SPECIFIER) as Promise<NodePathModule>,
    ]);
    const raw = await fsModule.readFile(inputPath);
    return {
      bytes: toUint8Array(raw),
      fileName: pathModule.basename(inputPath),
    };
  } catch (error) {
    throw new OkraRuntimeError(
      'INVALID_REQUEST',
      'Local file path uploads are only supported in Node.js. In browser runtimes, pass File/Blob, ArrayBuffer, Uint8Array, or URL.',
      400,
      error,
    );
  }
}

interface StructuredErrorEnvelope {
  code?: string;
  message?: string;
  details?: unknown;
  error?: string;
}

interface NormalizedSchema<T> {
  jsonSchema: JsonSchema;
  parser?: ZodType<T>;
}

function normalizeSchema<T>(schema: StructuredSchema<T>): NormalizedSchema<T> {
  const maybeZod = schema as ZodType<T>;
  const hasSafeParse = typeof (maybeZod as { safeParse?: unknown }).safeParse === 'function';
  if (hasSafeParse) {
    return {
      jsonSchema: z.toJSONSchema(maybeZod, { target: 'draft-2020-12' }) as JsonSchema,
      parser: maybeZod,
    };
  }
  return { jsonSchema: schema as JsonSchema };
}

function isStructuredCode(code: string | undefined): code is StructuredOutputErrorCode {
  return !!code && STRUCTURED_CODES.has(code as StructuredOutputErrorCode);
}

// ─── Session Handle ──────────────────────────────────────────────────────────

class OkraSessionHandle implements OkraSession {
  readonly id: string;
  readonly modelEndpoint: string;
  #model?: string;
  #client: OkraClient;

  constructor(client: OkraClient, documentId: string, model?: string) {
    this.#client = client;
    this.id = documentId;
    this.modelEndpoint = client.modelEndpoint(documentId);
    this.#model = model;
  }

  get model(): string | undefined {
    return this.#model;
  }

  state(): SessionState {
    return {
      id: this.id,
      model: this.#model,
      modelEndpoint: this.modelEndpoint,
    };
  }

  async setModel(model: string): Promise<void> {
    const normalized = model.trim();
    if (!normalized) {
      throw new OkraRuntimeError('INVALID_REQUEST', 'session.setModel requires a non-empty model', 400);
    }
    this.#model = normalized;
  }

  status(signal?: AbortSignal): Promise<DocumentStatus> {
    return this.#client.status(this.id, signal);
  }

  wait(options?: WaitOptions): Promise<DocumentStatus> {
    return this.#client.wait(this.id, options);
  }

  pages(options?: { range?: string; signal?: AbortSignal }): Promise<Page[]> {
    return this.#client.pages(this.id, options);
  }

  page(pageNumber: number, signal?: AbortSignal): Promise<Page> {
    return this.#client.page(this.id, pageNumber, signal);
  }

  entities(options?: { type?: string; limit?: number; offset?: number; signal?: AbortSignal }): Promise<EntitiesResponse> {
    return this.#client.entities(this.id, options);
  }

  downloadUrl(): string {
    return this.#client.downloadUrl(this.id);
  }

  query(sql: string, signal?: AbortSignal): Promise<QueryResult> {
    return this.#client.query(this.id, sql, signal);
  }

  logs(options?: LogsOptions): Promise<LogEntry[]> {
    return this.#client.logs(this.id, options);
  }

  publish(signal?: AbortSignal): Promise<PublishResult> {
    return this.#client.publish(this.id, signal);
  }

  shareLink(options?: ShareLinkOptions): Promise<ShareLinkResult> {
    return this.#client.shareLink(this.id, options);
  }

  prompt(
    query: string,
    options?: GenerateOptions & { schema?: undefined },
  ): Promise<GenerateResult>;
  prompt<T>(
    query: string,
    options: GenerateOptions & { schema: StructuredSchema<T> },
  ): Promise<GenerateResult<T>>;
  prompt<T = undefined>(
    query: string,
    options?: GenerateOptions,
  ): Promise<GenerateResult<T>> {
    const model = options?.model ?? this.#model;
    const merged = model ? { ...options, model } : options;
    if (merged?.schema !== undefined) {
      return this.#client.generate(
        this.id,
        query,
        merged as GenerateOptions & { schema: StructuredSchema<unknown> },
      ) as Promise<GenerateResult<T>>;
    }
    return this.#client.generate(
      this.id,
      query,
      merged as GenerateOptions & { schema?: undefined },
    ) as Promise<GenerateResult<T>>;
  }

  stream(
    query: string,
    options?: CompletionOptions,
  ): AsyncGenerator<CompletionEvent> {
    const model = options?.model ?? this.#model;
    const merged = model ? { ...options, model } : options;
    return this.#client.stream(this.id, query, merged);
  }
}

// ─── Client ──────────────────────────────────────────────────────────────────

export class OkraClient {
  private readonly baseUrl: string;
  private readonly apiKey?: string;
  private readonly sharedSecret?: string;
  private readonly fetchImpl: typeof globalThis.fetch;
  readonly sessions: {
    create: (sourceOrDocId: UploadInput, options?: SessionCreateOptions) => Promise<OkraSession>;
    from: (documentId: string, options?: SessionAttachOptions) => OkraSession;
  };
  readonly collections: {
    list: (signal?: AbortSignal) => Promise<CollectionSummary[]>;
    get: (collectionId: string, signal?: AbortSignal) => Promise<Collection>;
  };
  constructor(options: OkraClientOptions) {
    this.baseUrl = normalizeBaseUrl(options.baseUrl || DEFAULT_BASE_URL);
    this.apiKey = options.apiKey;
    this.sharedSecret = options.sharedSecret;
    this.fetchImpl = options.fetch || globalThis.fetch.bind(globalThis);

    if (!this.apiKey && !this.sharedSecret) {
      throw new OkraRuntimeError(
        'UNAUTHORIZED',
        'OkraClient requires either apiKey or sharedSecret',
        401,
      );
    }

    if (
      typeof globalThis !== 'undefined' && 'window' in globalThis
      && this.apiKey
      && !this.apiKey.startsWith('okra_pk_')
    ) {
      console.warn(
        '[OkraPDF] Secret API key detected in browser. Use a publishable key (okra_pk_...) for client-side usage. ' +
        'See https://docs.okrapdf.dev/api-keys#publishable-keys',
      );
    }

    this.sessions = {
      create: async (sourceOrDocId, sessionOptions = {}) => {
        let documentId: string;
        if (typeof sourceOrDocId === 'string' && isDocumentId(sourceOrDocId.trim())) {
          documentId = sourceOrDocId.trim();
        } else {
          const session = await this.upload(sourceOrDocId, sessionOptions.upload);
          documentId = session.id;
        }

        const session = this.sessions.from(documentId, { model: sessionOptions.model });
        if (sessionOptions.wait ?? true) {
          await session.wait(sessionOptions.waitOptions);
        }
        return session;
      },
      from: (documentId, sessionOptions = {}) => {
        const normalized = documentId.trim();
        if (!normalized) {
          throw new OkraRuntimeError(
            'INVALID_REQUEST',
            'sessions.from requires a non-empty documentId',
            400,
          );
        }

        return new OkraSessionHandle(
          this,
          normalized,
          sessionOptions.model?.trim() || undefined,
        );
      },
    };

    this.collections = {
      list: (signal) => this.collectionList(signal),
      get: (collectionId, signal) => this.collectionGet(collectionId, signal),
    };
  }

  // ─── Collections ────────────────────────────────────────────────────────

  private async collectionList(signal?: AbortSignal): Promise<CollectionSummary[]> {
    const res = await this.requestJson<{ collections: CollectionSummary[] }>(
      '/v1/collections',
      { method: 'GET', signal },
    );
    return res.collections;
  }

  private async collectionGet(collectionId: string, signal?: AbortSignal): Promise<Collection> {
    return this.requestJson<Collection>(
      `/v1/collections/${encodeURIComponent(collectionId)}`,
      { method: 'GET', signal },
    );
  }

  // ─── Upload ──────────────────────────────────────────────────────────────

  async upload(input: UploadInput, options: UploadOptions = {}): Promise<OkraSession> {
    const documentId = options.documentId || makeDocId();
    const path = `/document/${encodeURIComponent(documentId)}`;
    const visibility = options.visibility || 'private';

    if (typeof input === 'string' && isHttpUrl(input)) {
      const urlHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
      if (options.vendorKeys) {
        urlHeaders['X-Vendor-Keys'] = JSON.stringify(options.vendorKeys);
      }
      await this.requestJson<{ phase?: string }>(`${path}/upload-url`, {
        method: 'POST',
        headers: urlHeaders,
        body: JSON.stringify({
          url: input,
          capabilities: options.capabilities,
          visibility,
          redact: options.redact,
        }),
      });
      return this.sessions.from(documentId);
    }

    let bytes: Uint8Array;
    let fileName = options.fileName || 'document.pdf';
    if (typeof input === 'string') {
      const local = await readLocalFileFromNode(input);
      bytes = local.bytes;
      if (!options.fileName) fileName = local.fileName;
    } else if (isBlobLike(input)) {
      bytes = toUint8Array(await input.arrayBuffer());
      if (!options.fileName) {
        fileName = inferBlobName(input, fileName);
      }
    } else {
      bytes = toUint8Array(input);
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/pdf',
      'X-File-Name': fileName,
    };
    if (options.capabilities) {
      headers['X-Capabilities'] = JSON.stringify(options.capabilities);
    }
    if (options.vendorKeys) {
      headers['X-Vendor-Keys'] = JSON.stringify(options.vendorKeys);
    }
    if (options.redact) {
      headers['X-Redact'] = JSON.stringify(options.redact);
    }
    if (visibility === 'public') {
      headers['X-Visibility'] = 'public';
    }

    await this.requestJson<{ phase?: string }>(`${path}/upload`, {
      method: 'POST',
      headers,
      body: bytes as unknown as BodyInit,
    });

    return this.sessions.from(documentId);
  }

  // ─── Status / Wait ───────────────────────────────────────────────────────

  async status(documentId: string, signal?: AbortSignal): Promise<DocumentStatus> {
    return this.requestJson<DocumentStatus>(
      `/document/${encodeURIComponent(documentId)}/status`,
      { method: 'GET', signal },
    );
  }

  async wait(documentId: string, options: WaitOptions = {}): Promise<DocumentStatus> {
    const startedAt = Date.now();
    const timeoutMs = options.timeoutMs ?? DEFAULT_WAIT_TIMEOUT_MS;
    const pollIntervalMs = options.pollIntervalMs ?? DEFAULT_WAIT_POLL_MS;

    while (true) {
      if (options.signal?.aborted) {
        throw new OkraRuntimeError('TIMEOUT', 'Wait aborted', 499);
      }

      const current = await this.status(documentId, options.signal);
      if (COMPLETE_PHASES.has(current.phase)) {
        return current;
      }
      if (TERMINAL_ERROR_PHASES.has(current.phase)) {
        throw new OkraRuntimeError(
          'EXTRACTION_FAILED',
          `Document entered terminal error phase (${current.phase})`,
          500,
          current,
        );
      }

      const elapsed = Date.now() - startedAt;
      if (elapsed >= timeoutMs) {
        throw new OkraRuntimeError(
          'TIMEOUT',
          `Timed out waiting for document ${documentId} after ${timeoutMs}ms`,
          504,
          current,
        );
      }

      await sleep(pollIntervalMs);
    }
  }

  // ─── Pages ───────────────────────────────────────────────────────────────

  async pages(documentId: string, options?: { range?: string; signal?: AbortSignal }): Promise<Page[]> {
    const params = options?.range ? `?range=${encodeURIComponent(options.range)}` : '';
    return this.requestJson<Page[]>(
      `/document/${encodeURIComponent(documentId)}/pages${params}`,
      { method: 'GET', signal: options?.signal },
    );
  }

  async page(documentId: string, pageNumber: number, signal?: AbortSignal): Promise<Page> {
    return this.requestJson<Page>(
      `/document/${encodeURIComponent(documentId)}/page/${pageNumber}`,
      { method: 'GET', signal },
    );
  }

  // ─── Download ──────────────────────────────────────────────────────────

  downloadUrl(documentId: string): string {
    return `${this.baseUrl}/document/${encodeURIComponent(documentId)}/download`;
  }

  // ─── Entities ────────────────────────────────────────────────────────────

  async entities(
    documentId: string,
    options?: { type?: string; limit?: number; offset?: number; signal?: AbortSignal },
  ): Promise<EntitiesResponse> {
    const params = new URLSearchParams();
    if (options?.type) params.set('type', options.type);
    if (options?.limit) params.set('limit', String(options.limit));
    if (options?.offset) params.set('offset', String(options.offset));
    const qs = params.toString();
    return this.requestJson<EntitiesResponse>(
      `/document/${encodeURIComponent(documentId)}/nodes${qs ? `?${qs}` : ''}`,
      { method: 'GET', signal: options?.signal },
    );
  }

  // ─── Query (SQL) ─────────────────────────────────────────────────────────

  async query(documentId: string, sql: string, signal?: AbortSignal): Promise<QueryResult> {
    return this.requestJson<QueryResult>(
      `/document/${encodeURIComponent(documentId)}/query?select=${encodeURIComponent(sql)}`,
      { method: 'GET', signal },
    );
  }

  // ─── Logs ───────────────────────────────────────────────────────────────

  async logs(documentId: string, options?: LogsOptions): Promise<LogEntry[]> {
    const limit = options?.limit ?? 100;
    const res = await this.requestJson<{ entries: LogEntry[] }>(
      `/document/${encodeURIComponent(documentId)}/log?limit=${limit}`,
      { method: 'GET', signal: options?.signal },
    );
    return res.entries;
  }

  // ─── Stream (streaming completion via OpenAI SSE) ────────────────────────

  async *stream(
    documentId: string,
    query: string,
    options?: CompletionOptions,
  ): AsyncGenerator<CompletionEvent> {
    const response = await this.rawRequest(
      `/document/${encodeURIComponent(documentId)}/chat/completions`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: query }],
          stream: options?.stream !== false,
          ...(options?.model ? { model: options.model } : {}),
        }),
        signal: options?.signal,
      },
    );

    if (!response.ok) {
      const text = await response.text();
      throw new OkraRuntimeError('HTTP_ERROR', `Completion failed: ${text}`, response.status);
    }

    if (!response.body) {
      throw new OkraRuntimeError('INVALID_RESPONSE', 'No response body for completion stream', 500);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let fullText = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed === 'data: [DONE]') continue;
          if (!trimmed.startsWith('data: ')) continue;
          const json = trimmed.slice(6);
          try {
            const chunk = JSON.parse(json) as {
              choices?: Array<{ delta?: { content?: string }; finish_reason?: string | null }>;
              usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
              error?: { message?: string };
            };

            if (chunk.error) {
              yield { type: 'error', message: chunk.error.message || 'Stream error' };
              continue;
            }

            const delta = chunk.choices?.[0]?.delta?.content;
            if (delta) {
              fullText += delta;
              yield { type: 'text_delta', text: delta };
            }

            if (chunk.choices?.[0]?.finish_reason === 'stop') {
              yield { type: 'done', answer: fullText };
            }
          } catch {
            // skip malformed lines
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  // ─── Generate (non-streaming AI) ─────────────────────────────────────────

  async generate(
    documentId: string,
    query: string,
    options?: GenerateOptions & { schema?: undefined },
  ): Promise<GenerateResult>;
  async generate<T>(
    documentId: string,
    query: string,
    options: GenerateOptions & { schema: StructuredSchema<T> },
  ): Promise<GenerateResult<T>>;
  async generate<T = undefined>(
    documentId: string,
    query: string,
    options?: GenerateOptions,
  ): Promise<GenerateResult<T>> {
    if (options?.schema) {
      return this.generateStructured<T>(documentId, query, options);
    }

    const result = await this.requestJson<{
      id: string;
      choices: Array<{ message: { content: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
    }>(
      `/document/${encodeURIComponent(documentId)}/chat/completions`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: query }],
          ...(options?.model ? { model: options.model } : {}),
        }),
        signal: options?.signal,
      },
    );

    return {
      answer: result.choices?.[0]?.message?.content || '',
    };
  }

  private async generateStructured<T>(
    documentId: string,
    query: string,
    options: GenerateOptions,
  ): Promise<GenerateResult<T>> {
    if (!query || query.trim() === '') {
      throw new OkraRuntimeError('INVALID_REQUEST', 'generate with schema requires a non-empty query', 400);
    }

    const normalized = normalizeSchema(options.schema as StructuredSchema<T>);
    const result = await this.requestJson<{
      id: string;
      choices: Array<{ message: { content: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
    }>(
      `/document/${encodeURIComponent(documentId)}/chat/completions`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: query }],
          response_format: {
            type: 'json_schema',
            json_schema: { name: 'result', schema: normalized.jsonSchema },
          },
          ...(options.model ? { model: options.model } : {}),
        }),
        signal: options.signal,
      },
    );

    const raw = result.choices?.[0]?.message?.content;
    if (!raw) {
      throw new OkraRuntimeError('INVALID_RESPONSE', 'No content in structured output response', 500);
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new OkraRuntimeError('INVALID_RESPONSE', 'Structured output response is not valid JSON', 500);
    }

    let data: T;
    if (normalized.parser) {
      const zodResult = normalized.parser.safeParse(parsed);
      if (!zodResult.success) {
        throw new StructuredOutputError(
          'SCHEMA_VALIDATION_FAILED',
          'Client-side schema validation failed for structured output response',
          422,
          zodResult.error.issues,
        );
      }
      data = zodResult.data;
    } else {
      data = parsed as T;
    }

    return {
      answer: '',
      data,
    };
  }

  // ─── Model Endpoint ──────────────────────────────────────────────────────

  modelEndpoint(documentId: string): string {
    return `${this.baseUrl}/v1/documents/${encodeURIComponent(documentId)}`;
  }

  // ─── Publish / Share ────────────────────────────────────────────────────

  async publish(documentId: string, signal?: AbortSignal): Promise<PublishResult> {
    const result = await this.requestJson<Omit<PublishResult, 'url'>>(
      `/document/${encodeURIComponent(documentId)}/publish`,
      { method: 'POST', signal },
    );
    return {
      ...result,
      url: `${this.baseUrl}/v1/documents/${encodeURIComponent(documentId)}`,
    };
  }

  async shareLink(documentId: string, options?: ShareLinkOptions): Promise<ShareLinkResult> {
    return this.requestJson<ShareLinkResult>(
      `/document/${encodeURIComponent(documentId)}/share-link`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role: options?.role,
          label: options?.label,
          expiresInMs: options?.expiresInMs,
          maxViews: options?.maxViews,
        }),
        signal: options?.signal,
      },
    );
  }

  // ─── Public HTTP ─────────────────────────────────────────────────────────

  async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    return this.requestJson<T>(path, init);
  }

  get url(): string {
    return this.baseUrl;
  }

  // ─── Internal HTTP ───────────────────────────────────────────────────────

  private authHeaders(): Record<string, string> {
    if (this.apiKey) return { Authorization: `Bearer ${this.apiKey}` };
    if (this.sharedSecret) return { 'x-document-agent-secret': this.sharedSecret };
    return {};
  }

  private async rawRequest(path: string, init: RequestInit): Promise<Response> {
    const headers = new Headers(init.headers);
    for (const [key, value] of Object.entries(this.authHeaders())) {
      if (!headers.has(key)) headers.set(key, value);
    }

    try {
      return await this.fetchImpl(`${this.baseUrl}${path}`, { ...init, headers });
    } catch (err) {
      throw new OkraRuntimeError(
        'HTTP_ERROR',
        err instanceof Error ? err.message : String(err),
        502,
      );
    }
  }

  private async requestJson<T>(path: string, init: RequestInit): Promise<T> {
    const response = await this.rawRequest(path, init);
    const text = await response.text();
    const parsed = this.parseBody(text);

    if (!response.ok) {
      const envelope = parsed as StructuredErrorEnvelope | null;
      const code = envelope?.code;
      const message = envelope?.message || envelope?.error || `Request failed with status ${response.status}`;
      const details = envelope?.details ?? parsed ?? text;
      if (isStructuredCode(code)) {
        throw new StructuredOutputError(code, message, response.status, details);
      }
      const runtimeCode: RuntimeErrorCode = response.status === 401 ? 'UNAUTHORIZED' : 'HTTP_ERROR';
      throw new OkraRuntimeError(runtimeCode, message, response.status, details);
    }

    if (parsed === null) {
      throw new OkraRuntimeError(
        'INVALID_RESPONSE',
        `Expected JSON response for ${path}`,
        response.status,
        text,
      );
    }

    return parsed as T;
  }

  private parseBody(text: string): unknown | null {
    const trimmed = text.trim();
    if (!trimmed) return null;
    try {
      return JSON.parse(trimmed);
    } catch {
      return null;
    }
  }
}

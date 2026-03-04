// Client
export { OkraClient } from './client.js';

// Providers factory
export { createOkra, withCache, withQualityScore, withSecret } from './providers.js';
export type {
  ExtractionPhase,
  OkraProvider,
  OkraMiddleware,
  CreateOkraOptions,
} from './providers.js';

// Deterministic URL builder
export { doc } from './url.js';

// WebSocket session adapter
export { WsSession } from './ws-session.js';
export type { WsSendFn, WsSubscribeFn, WsSessionOptions, ChatStreamServerEvent } from './ws-session.js';

// Errors
export { OkraRuntimeError, StructuredOutputError } from './errors.js';

// Backward-compat alias (was OkraRuntime in @okrapdf/runtime)
export { OkraClient as OkraRuntime } from './client.js';

// Public types
export type {
  JsonSchema,
  RuntimeErrorCode,
  StructuredOutputErrorCode,
  OkraClientOptions,
  UploadInput,
  UploadRedactPiiOptions,
  UploadRedactOptions,
  UploadOptions,
  DocumentStatus,
  WaitOptions,
  Page,
  PageBlock,
  PageEntity,
  Entity,
  EntitiesResponse,
  QueryResult,
  LogEntry,
  LogsOptions,
  CompletionEvent,
  CompletionOptions,
  GenerateOptions,
  GenerateResult,
  SessionCreateOptions,
  SessionAttachOptions,
  SessionState,
  OkraSession,
  StructuredOutputMeta,
  StructuredSchema,
  PublishResult,
  ShareLinkOptions,
  ShareLinkLinks,
  ShareLinkCapabilities,
  ShareLinkResult,
  Collection,
  CollectionDocument,
  CollectionSummary,
  CollectionQueryEvent,
  CollectionQueryOptions,
  CollectionQueryResult,
  CollectionQueryStream,
  DocumentAnswer,
  OkraCollections,
  DocUrlOptions,
  UrlBuilderOptions,
} from './types.js';

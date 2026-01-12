/**
 * OCR Providers Module
 *
 * Exports the OCR provider interface, registry, and built-in providers.
 */

// Core types and interfaces
export * from './ocr-provider';

// Registry
export { OcrProviderRegistry, ocrRegistry, compareProviders } from './ocr-registry';
export type { ComparisonResult } from './ocr-registry';

// Built-in providers
export {
  GoogleDocAiProvider,
  GoogleDocAiProviderFactory,
  GoogleDocAiProviderMetadata,
  OKRAPDF_DOCAI_CONFIG,
} from './google-docai-provider';

// OpenRouter VLM provider
export {
  OpenRouterProvider,
  OpenRouterProviderFactory,
  OpenRouterProviderMetadata,
  OPENROUTER_VLM_MODELS,
} from './openrouter-provider';

// Auto-register built-in providers
// Import this to have providers registered automatically
export { ocrRegistry as registeredOcrRegistry } from './setup';

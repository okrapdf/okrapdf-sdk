/**
 * Provider Registry Setup
 *
 * Registers all built-in providers with the global registry.
 * Import this file to auto-register providers.
 */

import { ocrRegistry } from './ocr-registry';
import {
  GoogleDocAiProviderFactory,
  GoogleDocAiProviderMetadata,
} from './google-docai-provider';
import {
  OpenRouterProviderFactory,
  OpenRouterProviderMetadata,
} from './openrouter-provider';

// Register built-in providers
ocrRegistry.register('google-docai', GoogleDocAiProviderFactory, GoogleDocAiProviderMetadata);
ocrRegistry.register('openrouter', OpenRouterProviderFactory, OpenRouterProviderMetadata);

export { ocrRegistry };

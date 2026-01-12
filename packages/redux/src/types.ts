export type OcrProviderId = 
  | 'google-docai'
  | 'openrouter'
  | 'anthropic'
  | 'mistral'
  | 'tesseract'
  | 'docling'
  | string;

export interface OcrProviderConfig {
  apiKey?: string;
  modelId?: string;
  projectId?: string;
  processorId?: string;
  region?: string;
  [key: string]: unknown;
}

export interface ByokSettings {
  enabled: boolean;
  anthropicApiKey: string | null;
  openrouterApiKey?: string | null;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  toolName?: string;
  toolStatus?: 'start' | 'streaming' | 'success' | 'error';
}

export interface ValidationResult {
  provider: string;
  valid: boolean;
  error?: string;
  latencyMs?: number;
}

export interface SettingsAdapter {
  loadByokSettings: () => Promise<ByokSettings>;
  loadProviderConfig: (providerId: OcrProviderId) => Promise<OcrProviderConfig | null>;
  saveProviderConfig: (providerId: OcrProviderId, config: OcrProviderConfig) => Promise<void>;
  validateApiKey: (provider: string, apiKey: string) => Promise<ValidationResult>;
  testProviderHealth: (providerId: OcrProviderId, config: OcrProviderConfig) => Promise<ValidationResult>;
  listProviders: () => Promise<{ id: OcrProviderId }[]>;
}

/**
 * OCR Provider Registry
 *
 * Manages registration, discovery, and instantiation of OCR providers.
 * Inspired by Docling's BaseFactory pattern with pluggy-style discovery.
 */

import type {
  OcrProvider,
  OcrProviderId,
  OcrProviderFactory,
  OcrProviderMetadata,
  OcrProviderConfig,
} from './ocr-provider';

// ============================================================================
// Registry Class
// ============================================================================

export class OcrProviderRegistry {
  private factories = new Map<OcrProviderId, OcrProviderFactory>();
  private metadata = new Map<OcrProviderId, OcrProviderMetadata>();
  private instances = new Map<OcrProviderId, OcrProvider>();

  // ---------------------------------------------------------------------------
  // Registration
  // ---------------------------------------------------------------------------

  /**
   * Register a provider factory with metadata.
   */
  register(
    id: OcrProviderId,
    factory: OcrProviderFactory,
    meta: Omit<OcrProviderMetadata, 'id'>
  ): void {
    if (this.factories.has(id)) {
      console.warn(`OcrProviderRegistry: Overwriting existing provider '${id}'`);
    }

    this.factories.set(id, factory);
    this.metadata.set(id, { id, ...meta });
  }

  /**
   * Unregister a provider.
   */
  unregister(id: OcrProviderId): void {
    // Dispose instance if exists
    const instance = this.instances.get(id);
    if (instance) {
      instance.dispose().catch(console.error);
      this.instances.delete(id);
    }

    this.factories.delete(id);
    this.metadata.delete(id);
  }

  // ---------------------------------------------------------------------------
  // Discovery
  // ---------------------------------------------------------------------------

  /**
   * List all registered providers.
   */
  listProviders(): OcrProviderMetadata[] {
    return Array.from(this.metadata.values());
  }

  /**
   * List only available providers (dependencies installed, etc.)
   */
  async listAvailable(): Promise<OcrProviderMetadata[]> {
    const available: OcrProviderMetadata[] = [];

    for (const [id, meta] of this.metadata) {
      try {
        const factory = this.factories.get(id);
        if (factory) {
          // Create temporary instance to check availability
          const instance = factory({});
          if (instance.isAvailable()) {
            available.push(meta);
          }
        }
      } catch {
        // Provider not available
      }
    }

    return available;
  }

  /**
   * Get metadata for a specific provider.
   */
  getMetadata(id: OcrProviderId): OcrProviderMetadata | null {
    return this.metadata.get(id) ?? null;
  }

  /**
   * Check if a provider is registered.
   */
  has(id: OcrProviderId): boolean {
    return this.factories.has(id);
  }

  // ---------------------------------------------------------------------------
  // Instance Management
  // ---------------------------------------------------------------------------

  /**
   * Get or create a provider instance.
   * Caches instances for reuse.
   */
  async create(
    id: OcrProviderId,
    config: OcrProviderConfig
  ): Promise<OcrProvider> {
    // Check if we have a cached instance
    let instance = this.instances.get(id);

    if (!instance) {
      const factory = this.factories.get(id);
      if (!factory) {
        throw new Error(`OcrProviderRegistry: Unknown provider '${id}'`);
      }

      instance = factory(config);
      await instance.initialize(config);
      this.instances.set(id, instance);
    }

    return instance;
  }

  /**
   * Create a fresh instance without caching.
   * Useful for comparison mode.
   */
  async createFresh(
    id: OcrProviderId,
    config: OcrProviderConfig
  ): Promise<OcrProvider> {
    const factory = this.factories.get(id);
    if (!factory) {
      throw new Error(`OcrProviderRegistry: Unknown provider '${id}'`);
    }

    const instance = factory(config);
    await instance.initialize(config);
    return instance;
  }

  /**
   * Dispose a specific provider instance.
   */
  async dispose(id: OcrProviderId): Promise<void> {
    const instance = this.instances.get(id);
    if (instance) {
      await instance.dispose();
      this.instances.delete(id);
    }
  }

  /**
   * Dispose all provider instances.
   */
  async disposeAll(): Promise<void> {
    const disposePromises = Array.from(this.instances.values()).map((instance) =>
      instance.dispose().catch(console.error)
    );

    await Promise.all(disposePromises);
    this.instances.clear();
  }
}

// ============================================================================
// Singleton Registry
// ============================================================================

/**
 * Global OCR provider registry singleton.
 * Use this for app-wide provider management.
 */
export const ocrRegistry = new OcrProviderRegistry();

// ============================================================================
// Comparison Utilities
// ============================================================================

export interface ComparisonResult {
  providerId: OcrProviderId;
  pages: import('./ocr-provider').OcrPageResult[];
  durationMs: number;
  error?: string;
}

/**
 * Run extraction with multiple providers in parallel for comparison.
 */
export async function compareProviders(
  providerIds: OcrProviderId[],
  pdfBuffer: Buffer,
  configs: Record<OcrProviderId, OcrProviderConfig>
): Promise<ComparisonResult[]> {
  const results = await Promise.all(
    providerIds.map(async (id) => {
      const startTime = Date.now();

      try {
        const provider = await ocrRegistry.createFresh(id, configs[id] ?? {});
        const pages: import('./ocr-provider').OcrPageResult[] = [];

        for await (const page of provider.extractDocument(pdfBuffer)) {
          pages.push(page);
        }

        await provider.dispose();

        return {
          providerId: id,
          pages,
          durationMs: Date.now() - startTime,
        };
      } catch (error) {
        return {
          providerId: id,
          pages: [],
          durationMs: Date.now() - startTime,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    })
  );

  return results;
}

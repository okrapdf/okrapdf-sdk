import { OkraClient } from '../client';
import { ExtractionResult } from '../types';

export class ExtractionsResource {
  private client: OkraClient;

  constructor(client: OkraClient) {
    this.client = client;
  }

  /**
   * Get extractions for a document.
   */
  async get(documentUuid: string, options: { page?: number; pages?: number[] } = {}): Promise<ExtractionResult> {
    const params = new URLSearchParams();
    if (options.page) params.set('page', options.page.toString());
    if (options.pages) params.set('pages', options.pages.join(','));

    const query = params.toString() ? `?${params.toString()}` : '';
    return this.client.fetch<ExtractionResult>(`/api/extractions/${documentUuid}${query}`);
  }
}

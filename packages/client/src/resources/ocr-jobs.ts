import { OkraClient } from '../client';
import {
  VerificationTreeResponse,
  EntitiesResponse,
  PageContentResponse,
  SavePageVersionResponse,
  ResolvePageRequest,
  PageVersionsResponse,
  TablesResponse,
  SearchResponse,
  HistoryResponse,
  EntityType,
} from '../types';

/**
 * Resource for OCR job operations.
 * Maps to the review page UI interactions:
 * - tree: Left panel (document tree, verification status)
 * - find/entities: Middle panel (entity overlays)
 * - page: Right panel (markdown content, editing)
 */
export class OcrJobsResource {
  private client: OkraClient;

  constructor(client: OkraClient) {
    this.client = client;
  }

  // ============================================================================
  // Verification Tree (Left Panel - Document Tree)
  // ============================================================================

  /**
   * Get the verification tree for a job.
   * Shows page-level verification status and entity counts.
   */
  async getVerificationTree(jobId: string): Promise<VerificationTreeResponse> {
    return this.client.fetch<VerificationTreeResponse>(`/api/ocr/jobs/${jobId}/verification-tree`);
  }

  // ============================================================================
  // Entities (Middle Panel - Entity Overlays)
  // ============================================================================

  /**
   * Get all entities for a job.
   * @param jobId - The OCR job ID
   * @param type - Optional filter by entity type
   */
  async getEntities(
    jobId: string,
    type: EntityType | 'all' = 'all'
  ): Promise<EntitiesResponse> {
    return this.client.fetch<EntitiesResponse>(`/api/ocr/jobs/${jobId}/entities?type=${type}`);
  }

  // ============================================================================
  // Page Content (Right Panel - Markdown Editor)
  // ============================================================================

  /**
   * Get page content (markdown).
   */
  async getPageContent(jobId: string, pageNum: number): Promise<PageContentResponse> {
    return this.client.fetch<PageContentResponse>(`/api/ocr/jobs/${jobId}/pages/${pageNum}`);
  }

  /**
   * Save edited page content as a new version.
   */
  async savePageContent(
    jobId: string,
    pageNum: number,
    content: string
  ): Promise<SavePageVersionResponse> {
    return this.client.fetch<SavePageVersionResponse>(`/api/ocr/jobs/${jobId}/pages/${pageNum}`, {
      method: 'PATCH',
      body: JSON.stringify({ content }),
    });
  }

  /**
   * Resolve page verification status.
   * Used to mark pages as reviewed, intentional empty, needs re-extraction, etc.
   */
  async resolvePageStatus(
    jobId: string,
    pageNum: number,
    request: ResolvePageRequest
  ): Promise<{ success: boolean }> {
    return this.client.fetch<{ success: boolean }>(`/api/ocr/jobs/${jobId}/pages/${pageNum}/resolve`, {
      method: 'POST',
      body: JSON.stringify(request),
    });
  }

  /**
   * List all versions for a page.
   */
  async listPageVersions(jobId: string, pageNum: number): Promise<PageVersionsResponse> {
    return this.client.fetch<PageVersionsResponse>(`/api/ocr/jobs/${jobId}/pages/${pageNum}/versions`);
  }

  /**
   * Get content for a specific version.
   */
  async getPageVersionContent(
    jobId: string,
    pageNum: number,
    version: number
  ): Promise<PageContentResponse> {
    return this.client.fetch<PageContentResponse>(
      `/api/ocr/jobs/${jobId}/pages/${pageNum}/versions/${version}`
    );
  }

  // ============================================================================
  // Tables
  // ============================================================================

  /**
   * Get tables for a job.
   * @param jobId - The OCR job ID
   * @param page - Optional page number filter
   */
  async getTables(jobId: string, page?: number): Promise<TablesResponse> {
    const url = page
      ? `/api/ocr/jobs/${jobId}/tables?page=${page}`
      : `/api/ocr/jobs/${jobId}/tables`;
    return this.client.fetch<TablesResponse>(url);
  }

  // ============================================================================
  // Search
  // ============================================================================

  /**
   * Search page content across all pages.
   */
  async search(jobId: string, query: string): Promise<SearchResponse> {
    return this.client.fetch<SearchResponse>(
      `/api/ocr/jobs/${jobId}/search?q=${encodeURIComponent(query)}`
    );
  }

  // ============================================================================
  // History
  // ============================================================================

  /**
   * Get verification history (audit trail).
   */
  async getHistory(jobId: string, limit = 50): Promise<HistoryResponse> {
    return this.client.fetch<HistoryResponse>(`/api/ocr/jobs/${jobId}/history?limit=${limit}`);
  }
}

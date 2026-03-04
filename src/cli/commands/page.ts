/**
 * okra page - Page content operations
 *
 * Maps to: Right panel of review page (markdown editor)
 * Get, edit, and resolve page content.
 *
 * Usage:
 *   okra page get <jobId> <pageNum>               # Get page markdown
 *   okra page get <jobId> <pageNum> --version 2   # Get specific version
 *   okra page edit <jobId> <pageNum> <content>    # Edit page content
 *   okra page resolve <jobId> <pageNum> reviewed  # Mark as reviewed
 *   okra page versions <jobId> <pageNum>          # List versions
 */

import type { OkraClient } from '../../client';
import type { PageContent, PageVersionsResponse } from '../types';

export type PageContentResponse = PageContent;

export interface PageGetOptions {
  version?: number;
  format?: 'text' | 'json' | 'markdown';
}

export interface PageResolveOptions {
  resolution: string;
  classification?: string;
  reason?: string;
}

/**
 * Get page content.
 */
export async function pageGet(
  client: OkraClient,
  jobId: string,
  pageNum: number,
  options: PageGetOptions = {}
): Promise<PageContentResponse> {
  if (options.version) {
    return client.request<PageContentResponse>(`/document/${jobId}/pages/${pageNum}/versions/${options.version}`);
  }
  return client.request<PageContentResponse>(`/document/${jobId}/pages/${pageNum}`);
}

/**
 * Edit page content.
 */
export async function pageEdit(
  client: OkraClient,
  jobId: string,
  pageNum: number,
  content: string
): Promise<{ success: boolean; version: number }> {
  const result = await client.request<{ success: boolean; version: number }>(
    `/document/${jobId}/pages/${pageNum}`,
    {
      method: 'POST',
      body: JSON.stringify({ content }),
      headers: { 'Content-Type': 'application/json' },
    }
  );
  return { success: result.success, version: result.version };
}

/**
 * Resolve page verification status.
 */
export async function pageResolve(
  client: OkraClient,
  jobId: string,
  pageNum: number,
  options: PageResolveOptions
): Promise<{ success: boolean }> {
  return client.request<{ success: boolean }>(
    `/document/${jobId}/pages/${pageNum}/resolve`,
    {
      method: 'POST',
      body: JSON.stringify(options),
      headers: { 'Content-Type': 'application/json' },
    }
  );
}

/**
 * List page versions.
 */
export async function pageVersions(
  client: OkraClient,
  jobId: string,
  pageNum: number
): Promise<PageVersionsResponse> {
  return client.request<PageVersionsResponse>(`/document/${jobId}/pages/${pageNum}/versions`);
}

/**
 * Format page content for output.
 */
export function formatPageOutput(
  content: PageContentResponse,
  format: 'text' | 'json' | 'markdown' = 'markdown'
): string {
  if (format === 'json') {
    return JSON.stringify(content, null, 2);
  }

  if (format === 'markdown') {
    return content.content;
  }

  // Text format with metadata
  const lines: string[] = [];
  lines.push(`Page ${content.page}`);
  if (content.version) {
    lines.push(`Version: ${content.version}`);
  }
  lines.push(`Length: ${content.content.length} chars`);
  lines.push('');
  lines.push('---');
  lines.push(content.content);

  return lines.join('\n');
}

/**
 * Format versions list for output.
 */
export function formatVersionsOutput(
  versions: PageVersionsResponse,
  format: 'text' | 'json' = 'text'
): string {
  if (format === 'json') {
    return JSON.stringify(versions, null, 2);
  }

  const lines: string[] = [];
  lines.push(`Page ${versions.page} - ${versions.versions.length} versions`);
  lines.push(`Current: v${versions.currentVersion}`);
  lines.push('');

  for (const v of versions.versions) {
    const current = v.version === versions.currentVersion ? ' *' : '';
    const date = v.createdAt ? new Date(v.createdAt).toLocaleString() : 'unknown';
    lines.push(`  v${v.version}${current} [${v.editSource}] ${date}`);
    if (v.preview) {
      lines.push(`    "${v.preview.slice(0, 60)}${v.preview.length > 60 ? '...' : ''}"`);
    }
  }

  return lines.join('\n');
}

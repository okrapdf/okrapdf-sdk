/**
 * okra tables - List and filter tables
 *
 * Usage:
 *   okra tables <jobId>
 *   okra tables <jobId> --page 5
 *   okra tables <jobId> --status pending
 *   okra tables <jobId> --format json
 */

import type { OkraClient } from '../../client';
import type { TablesResponse, Table } from '../types';

export interface TablesOptions {
  page?: number;
  status?: 'pending' | 'verified' | 'flagged' | 'rejected';
  format?: 'text' | 'json' | 'markdown';
}

/**
 * Get tables for a job.
 */
export async function tables(
  client: OkraClient,
  jobId: string,
  options: TablesOptions = {}
): Promise<TablesResponse> {
  const url = options.page
    ? `/document/${jobId}/tables?page=${options.page}`
    : `/document/${jobId}/tables`;
  const result = await client.request<TablesResponse>(url);

  // Filter by status if specified
  if (options.status) {
    result.tables = result.tables.filter((t) => t.verificationStatus === options.status);
  }

  return result;
}

/**
 * Format tables for output.
 */
export function formatTablesOutput(
  result: TablesResponse,
  format: 'text' | 'json' | 'markdown' = 'text'
): string {
  if (format === 'json') {
    return JSON.stringify(result, null, 2);
  }

  if (format === 'markdown') {
    // Output each table's markdown
    return result.tables.map((t) => {
      return `## Table (p${t.pageNumber})\n\n${t.markdown}`;
    }).join('\n\n---\n\n');
  }

  // Text format
  const lines: string[] = [];
  lines.push(`Tables: ${result.tables.length}`);
  lines.push('');

  // Group by page
  const byPage = new Map<number, Table[]>();
  for (const t of result.tables) {
    const pageGroup = byPage.get(t.pageNumber) || [];
    pageGroup.push(t);
    byPage.set(t.pageNumber, pageGroup);
  }

  for (const [page, pageTables] of [...byPage.entries()].sort((a, b) => a[0] - b[0])) {
    lines.push(`Page ${page}:`);
    for (const t of pageTables) {
      const status = getStatusIcon(t.verificationStatus);
      const conf = t.confidence !== null ? ` (${(t.confidence * 100).toFixed(0)}%)` : '';
      const preview = t.markdown.split('\n')[0].slice(0, 50);
      lines.push(`  ${status} ${t.id}${conf}`);
      lines.push(`    ${preview}${t.markdown.length > 50 ? '...' : ''}`);
    }
  }

  return lines.join('\n');
}

function getStatusIcon(status: string): string {
  switch (status) {
    case 'verified':
      return '✓';
    case 'pending':
      return '○';
    case 'flagged':
      return '⚑';
    case 'rejected':
      return '✗';
    default:
      return '?';
  }
}

/**
 * okra tables - List and filter tables
 *
 * Usage:
 *   okra tables <jobId>
 *   okra tables <jobId> --page 5
 *   okra tables <jobId> --status pending
 *   okra tables <jobId> --format json
 */

import { OkraClient } from '@okrapdf/sdk';
import type { TablesResponse, TableRecord } from '@okrapdf/sdk';

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
  const result = await client.ocrJobs.getTables(jobId, options.page);

  // Filter by status if specified
  if (options.status) {
    result.tables = result.tables.filter((t) => t.verification_status === options.status);
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
      return `## Table (p${t.page_number})\n\n${t.markdown}`;
    }).join('\n\n---\n\n');
  }

  // Text format
  const lines: string[] = [];
  lines.push(`Tables: ${result.tables.length}`);
  lines.push('');

  // Group by page
  const byPage = new Map<number, TableRecord[]>();
  for (const t of result.tables) {
    const pageGroup = byPage.get(t.page_number) || [];
    pageGroup.push(t);
    byPage.set(t.page_number, pageGroup);
  }

  for (const [page, pageTables] of [...byPage.entries()].sort((a, b) => a[0] - b[0])) {
    lines.push(`Page ${page}:`);
    for (const t of pageTables) {
      const status = getStatusIcon(t.verification_status);
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

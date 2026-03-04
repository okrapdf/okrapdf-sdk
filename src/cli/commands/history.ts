/**
 * okra history - Verification audit trail
 *
 * Usage:
 *   okra history <jobId>
 *   okra history <jobId> --limit 20
 *   okra history <jobId> --format json
 */

import type { OkraClient } from '../../client';
import type { HistoryResponse } from '../types';

export interface HistoryOptions {
  limit?: number;
  format?: 'text' | 'json';
}

/**
 * Get verification history.
 */
export async function history(
  client: OkraClient,
  jobId: string,
  options: HistoryOptions = {}
): Promise<HistoryResponse> {
  const limit = options.limit || 50;
  return client.request<HistoryResponse>(`/document/${jobId}/history?limit=${limit}`);
}

/**
 * Format history for output.
 */
export function formatHistoryOutput(
  result: HistoryResponse,
  format: 'text' | 'json' = 'text'
): string {
  if (format === 'json') {
    return JSON.stringify(result, null, 2);
  }

  const lines: string[] = [];
  lines.push(`History: ${result.history.length} entries`);
  lines.push('');

  for (const entry of result.history) {
    const date = new Date(entry.createdAt).toLocaleString();
    const page = entry.pageNum !== null ? ` p${entry.pageNum}` : '';
    const transition = entry.transitionName || `${entry.previousState || '?'} -> ${entry.state}`;
    const by = entry.triggeredByName || entry.triggeredBy || 'system';

    lines.push(`[${date}] ${entry.entityType}${page}`);
    lines.push(`  ${transition} by ${by}`);
    if (entry.reason) {
      lines.push(`  Reason: ${entry.reason}`);
    }
    if (entry.resolution) {
      lines.push(`  Resolution: ${entry.resolution}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

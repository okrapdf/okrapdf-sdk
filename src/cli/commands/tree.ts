/**
 * okra tree - Document verification tree command
 *
 * Maps to: Left panel of review page
 * Shows page-level verification status and entity counts.
 *
 * Usage:
 *   okra tree <jobId>
 *   okra tree <jobId> --status pending
 *   okra tree <jobId> --entity table
 *   okra tree <jobId> --format json
 */

import type { OkraClient } from '../../client';
import type {
  VerificationPageStatus,
  EntityType,
} from '../types';

// Re-export VerificationTree types from CLI types
export type { VerificationTree as VerificationTreeResponse } from '../types';

export interface TreeOptions {
  status?: VerificationPageStatus;
  entity?: EntityType;
  format?: 'text' | 'json' | 'markdown';
}

export interface TreeResult {
  tree: any; // Will use VerificationTree from types
  filteredPages: number[];
}

/**
 * Get the verification tree for a job.
 */
export async function tree(
  client: OkraClient,
  jobId: string,
  options: TreeOptions = {}
): Promise<TreeResult> {
  const treeData = await client.request<any>(`/document/${jobId}/verification-tree`);

  // Filter pages if status filter specified
  let filteredPages = treeData.pages.map((p: any) => p.page);

  if (options.status) {
    filteredPages = treeData.pages
      .filter((p: any) => p.status === options.status)
      .map((p: any) => p.page);
  }

  // If entity filter specified, we need to fetch entities and filter
  if (options.entity) {
    const entitiesData = await client.request<any>(`/document/${jobId}/nodes?type=${options.entity}`);
    const pagesWithEntity = new Set(entitiesData.entities.map((e: any) => e.page));
    filteredPages = filteredPages.filter((p: number) => pagesWithEntity.has(p));
  }

  return { tree: treeData, filteredPages };
}

/**
 * Format tree result for output.
 */
export function formatTreeOutput(
  result: TreeResult,
  format: 'text' | 'json' | 'markdown' = 'text'
): string {
  if (format === 'json') {
    return JSON.stringify(result, null, 2);
  }

  const { tree: treeData, filteredPages } = result;
  const lines: string[] = [];

  if (format === 'markdown') {
    lines.push(`# Verification Tree: ${treeData.jobId}`);
    lines.push('');
    lines.push(`**Total Pages:** ${treeData.totalPages}`);
    lines.push('');
    lines.push('## Summary');
    lines.push('| Status | Count |');
    lines.push('|--------|-------|');
    lines.push(`| Complete | ${treeData.summary.complete} |`);
    lines.push(`| Partial | ${treeData.summary.partial} |`);
    lines.push(`| Pending | ${treeData.summary.pending} |`);
    lines.push(`| Flagged | ${treeData.summary.flagged} |`);
    lines.push(`| Empty | ${treeData.summary.empty} |`);
    lines.push(`| Gap | ${treeData.summary.gap} |`);
    lines.push('');
    lines.push('## Pages');
    lines.push('| Page | Status | Total | Verified | Pending | Flagged |');
    lines.push('|------|--------|-------|----------|---------|---------|');

    for (const page of treeData.pages) {
      if (filteredPages.includes(page.page)) {
        lines.push(
          `| ${page.page} | ${page.status} | ${page.total} | ${page.verified} | ${page.pending} | ${page.flagged} |`
        );
      }
    }
  } else {
    // Text format
    lines.push(`Verification Tree: ${treeData.jobId}`);
    lines.push(`Total Pages: ${treeData.totalPages}`);
    lines.push('');
    lines.push('Summary:');
    lines.push(`  Complete: ${treeData.summary.complete}`);
    lines.push(`  Partial:  ${treeData.summary.partial}`);
    lines.push(`  Pending:  ${treeData.summary.pending}`);
    lines.push(`  Flagged:  ${treeData.summary.flagged}`);
    lines.push(`  Empty:    ${treeData.summary.empty}`);
    lines.push(`  Gap:      ${treeData.summary.gap}`);
    lines.push('');
    lines.push('Pages:');

    for (const page of treeData.pages) {
      if (filteredPages.includes(page.page)) {
        const statusIcon = getStatusIcon(page.status);
        const counts = `[${page.verified}/${page.total}]`;
        const flags = page.flagged > 0 ? ` (${page.flagged} flagged)` : '';
        const gaps = page.hasCoverageGaps ? ' [GAP]' : '';
        lines.push(`  ${statusIcon} p${page.page.toString().padStart(3)} ${counts}${flags}${gaps}`);
      }
    }
  }

  return lines.join('\n');
}

function getStatusIcon(status: VerificationPageStatus): string {
  switch (status) {
    case 'complete':
      return '✓';
    case 'partial':
      return '◐';
    case 'pending':
      return '○';
    case 'flagged':
      return '⚑';
    case 'empty':
      return '·';
    case 'gap':
      return '!';
    case 'error':
      return '✗';
    default:
      return '?';
  }
}

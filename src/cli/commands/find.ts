/**
 * okra find - Entity search with jQuery-like selectors
 *
 * Maps to: Middle panel of review page (entity overlays)
 * Find entities using CSS-like selectors.
 *
 * Usage:
 *   okra find <jobId> ".table"                    # Find all tables
 *   okra find <jobId> ".figure:page(5)"           # Figures on page 5
 *   okra find <jobId> "[confidence>0.9]"          # High confidence entities
 *   okra find <jobId> ".table, .figure"           # Tables OR figures
 *   okra find <jobId> "*" --stats                 # All entities with stats
 *   okra find <jobId> ".table" --top-k 10         # Top 10 tables
 */

import type { OkraClient } from '../../client';
import type { Entity } from '../types';
import { executeQuery, QueryOptions, QueryResult, QueryStats } from '../query-engine';

export interface FindOptions extends QueryOptions {
  stats?: boolean;
  format?: 'text' | 'json' | 'entities' | 'ids';
}

/**
 * Find entities matching a selector.
 */
export async function find(
  client: OkraClient,
  jobId: string,
  selector: string,
  options: FindOptions = {}
): Promise<QueryResult> {
  const entitiesData = await client.request<{ entities: Entity[] }>(`/document/${jobId}/nodes`);
  return executeQuery(entitiesData.entities, selector, options);
}

/**
 * Format find result for output.
 */
export function formatFindOutput(
  result: QueryResult,
  format: 'text' | 'json' | 'entities' | 'ids' = 'text',
  showStats = false
): string {
  if (format === 'json') {
    return JSON.stringify(showStats ? result : result.entities, null, 2);
  }

  if (format === 'ids') {
    return result.entities.map((e) => e.id).join('\n');
  }

  if (format === 'entities') {
    return result.entities
      .map((e) => `${e.type}\t${e.page}\t${e.id}\t${e.title || ''}`)
      .join('\n');
  }

  // Text format
  const lines: string[] = [];
  lines.push(`Found ${result.total} entities`);
  lines.push('');

  if (showStats) {
    lines.push('Stats:');
    lines.push(`  By Type:`);
    for (const [type, count] of Object.entries(result.stats.byType)) {
      lines.push(`    ${type}: ${count}`);
    }
    lines.push(`  Confidence: avg=${result.stats.avgConfidence.toFixed(2)}, min=${result.stats.minConfidence.toFixed(2)}, max=${result.stats.maxConfidence.toFixed(2)}`);
    lines.push(`  Pages: ${Object.keys(result.stats.byPage).length}`);
    lines.push('');
  }

  lines.push('Entities:');
  for (const entity of result.entities) {
    const conf = entity.confidence !== undefined ? ` (${(entity.confidence * 100).toFixed(0)}%)` : '';
    const title = entity.title ? ` "${entity.title.slice(0, 40)}${entity.title.length > 40 ? '...' : ''}"` : '';
    lines.push(`  [p${entity.page}] ${entity.type}${title}${conf}`);
  }

  return lines.join('\n');
}

/**
 * Format stats only.
 */
export function formatStats(stats: QueryStats): string {
  const lines: string[] = [];
  lines.push(`Total: ${stats.total}`);
  lines.push('');
  lines.push('By Type:');
  for (const [type, count] of Object.entries(stats.byType)) {
    const pct = ((count / stats.total) * 100).toFixed(1);
    lines.push(`  ${type.padEnd(12)} ${count.toString().padStart(4)} (${pct}%)`);
  }
  lines.push('');
  lines.push('By Page:');
  const pageCounts = Object.entries(stats.byPage)
    .sort((a, b) => parseInt(a[0]) - parseInt(b[0]))
    .slice(0, 20); // Show first 20 pages
  for (const [page, count] of pageCounts) {
    lines.push(`  p${page.padStart(3)}: ${'█'.repeat(Math.min(count, 40))} ${count}`);
  }
  if (Object.keys(stats.byPage).length > 20) {
    lines.push(`  ... and ${Object.keys(stats.byPage).length - 20} more pages`);
  }
  lines.push('');
  lines.push('Confidence:');
  lines.push(`  Average: ${(stats.avgConfidence * 100).toFixed(1)}%`);
  lines.push(`  Min:     ${(stats.minConfidence * 100).toFixed(1)}%`);
  lines.push(`  Max:     ${(stats.maxConfidence * 100).toFixed(1)}%`);

  return lines.join('\n');
}

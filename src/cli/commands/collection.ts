/**
 * okra collection — List collections and run fan-out queries.
 *
 * Usage:
 *   okra collection list                                          # table
 *   okra collection list --json                                   # JSON array
 *   okra collection query mag7-10k "What was total revenue?"      # table
 *   okra collection query mag7-10k "What was total revenue?" -o /tmp/rev.csv
 *   okra collection query mag7-10k "Revenue?" --json              # raw JSONL
 */

import type { OkraClient } from '../../client';
import type { GlobalFlags } from '../output';
import { progress, csvEscape } from '../output';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface CollectionRow {
  id: string;
  name: string;
  description?: string | null;
  document_count: number;
}

export interface QueryResultRow {
  doc_id: string;
  status: string;
  answer: string;
  cost_usd: number;
  duration_ms: number;
  error?: string;
}

export interface QuerySummary {
  completed: number;
  failed: number;
  total_cost_usd: number;
}

export interface CollectionListOpts extends GlobalFlags {}

export interface CollectionQueryOpts extends GlobalFlags {
  schema?: string;
}

// ─── List ────────────────────────────────────────────────────────────────────

export async function collectionList(
  client: OkraClient,
  _opts: CollectionListOpts,
): Promise<CollectionRow[]> {
  return client.collections.list() as Promise<CollectionRow[]>;
}

export function formatCollectionList(rows: CollectionRow[], json?: boolean): string {
  if (json) return JSON.stringify(rows);
  if (rows.length === 0) return 'No collections found.';

  const header = 'ID\tNAME\tDOCS';
  const lines = rows.map(
    (r) => `${r.id}\t${r.name}\t${r.document_count}`,
  );
  return [header, ...lines].join('\n');
}

// ─── Publish / Unpublish ─────────────────────────────────────────────────────

export async function collectionSetVisibility(
  client: OkraClient,
  nameOrId: string,
  visibility: 'public' | 'private',
): Promise<{ ok: boolean }> {
  return client.request<{ ok: boolean }>(
    `/v1/collections/${encodeURIComponent(nameOrId)}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ visibility }),
    },
  );
}

// ─── Query ───────────────────────────────────────────────────────────────────

/**
 * Raw NDJSON fan-out query — bypasses client.request() to consume the stream.
 * Called directly from bin.ts.
 */
export async function collectionQueryRaw(
  baseUrl: string,
  apiKey: string,
  nameOrId: string,
  question: string,
  opts: CollectionQueryOpts,
): Promise<{ results: QueryResultRow[]; summary: QuerySummary }> {
  progress(`Querying collection "${nameOrId}"…`, opts.quiet);

  const body: Record<string, unknown> = { prompt: question, stream: true };

  if (opts.schema) {
    const { readFileSync } = await import('fs');
    body.schema = JSON.parse(readFileSync(opts.schema, 'utf8'));
  }

  const url = `${baseUrl.replace(/\/+$/, '')}/v1/collections/${encodeURIComponent(nameOrId)}/query`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Collection query failed (${response.status}): ${text}`);
  }

  const text = await response.text();
  const lines = text.trim().split('\n').filter(Boolean);
  const events = lines.map((line) => JSON.parse(line));

  const results: QueryResultRow[] = [];
  let summary: QuerySummary = { completed: 0, failed: 0, total_cost_usd: 0 };

  for (const event of events) {
    if (event.type === 'result') {
      results.push({
        doc_id: event.doc_id,
        status: event.status,
        answer: event.answer ?? '',
        cost_usd: event.usage?.cost_usd ?? 0,
        duration_ms: event.duration_ms ?? 0,
        error: event.error,
      });
      progress(
        `  ${event.status === 'fulfilled' ? '+' : '!'} ${event.doc_id} (${event.duration_ms}ms)`,
        opts.quiet,
      );
    } else if (event.type === 'done') {
      summary = {
        completed: event.completed,
        failed: event.failed,
        total_cost_usd: event.total_cost_usd,
      };
    } else if (event.type === 'start') {
      progress(`  ${event.doc_count} documents`, opts.quiet);
    } else if (event.type === 'error') {
      throw new Error(event.error || 'Collection query error');
    }
  }

  return { results, summary };
}

// ─── Formatters ──────────────────────────────────────────────────────────────

export function formatCollectionCsv(results: QueryResultRow[]): string {
  const header = 'doc_id,status,answer,cost_usd,duration_ms';
  const rows = results.map((r) =>
    [
      r.doc_id,
      r.status,
      csvEscape(r.answer),
      r.cost_usd,
      r.duration_ms,
    ].join(','),
  );
  return [header, ...rows].join('\n');
}

export function formatCollectionTable(results: QueryResultRow[]): string {
  if (results.length === 0) return 'No results.';
  const header = 'DOC_ID\tSTATUS\tANSWER\tCOST\tDUR_MS';
  const rows = results.map(
    (r) =>
      `${r.doc_id}\t${r.status}\t${r.answer.slice(0, 80)}${r.answer.length > 80 ? '…' : ''}\t$${r.cost_usd.toFixed(4)}\t${r.duration_ms}`,
  );
  return [header, ...rows].join('\n');
}

export function formatQueryJsonl(results: QueryResultRow[]): string {
  return results.map((r) => JSON.stringify(r)).join('\n');
}

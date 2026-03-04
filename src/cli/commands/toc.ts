/**
 * okra toc - Extract table of contents from a PDF
 *
 * Usage:
 *   okra toc <jobId>
 *   okra toc <jobId> --max-depth 3
 *   okra toc <jobId> --format json
 *   okra toc <jobId> --format markdown
 */

import type { OkraClient } from '../../client';
import WebSocket from 'ws';

export interface TocEntry {
  level: number;
  title: string;
  page: number;
}

export interface TocResult {
  file_name: string;
  strategy: string;
  total_entries: number;
  total_pages: number;
  elapsed_ms: number;
  total_elapsed_ms: number;
  toc: TocEntry[];
  _replay?: {
    sessionId: string;
    replayUrl: string;
  };
}

export interface TocOptions {
  maxDepth?: number;
  format?: 'text' | 'json' | 'markdown';
  watch?: boolean;
}

/**
 * Extract table of contents from a document.
 */
export async function toc(
  client: OkraClient,
  jobId: string,
  options: TocOptions = {}
): Promise<TocResult> {
  const params = options.maxDepth ? `?maxDepth=${options.maxDepth}` : '';
  const result = await client.request<TocResult>(`/document/${jobId}/toc${params}`);

  // Watch live events if requested
  if (options.watch && result._replay) {
    console.log(`\n📼 Watching live events for session ${result._replay.sessionId}...\n`);
    await watchLiveEvents(result._replay.replayUrl);
  }

  return result;
}

/**
 * Connect to WebSocket and watch live TOC extraction events.
 */
async function watchLiveEvents(wsUrl: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let hasSeenEvents = false;

    ws.on('open', () => {
      // Request event history (JOIN_SESSION)
      ws.send(JSON.stringify({ type: 'JOIN_SESSION' }));
    });

    ws.on('message', (data: WebSocket.Data) => {
      try {
        const event = JSON.parse(data.toString());

        // Handle event batch (history replay)
        if (event.type === 'EVENTS_BATCH') {
          for (const evt of event.events) {
            printEvent(evt);
            hasSeenEvents = true;
          }
        }
        // Handle individual events
        else if (event.type && event.type.startsWith('TOC_')) {
          printEvent(event);
          hasSeenEvents = true;
        }
        // Track completion
        else if (event.type === 'TOC_RESPONSE_READY') {
          printEvent(event);
          hasSeenEvents = true;
          // Close after seeing final event
          setTimeout(() => {
            ws.close();
            resolve();
          }, 500);
        }
      } catch (err) {
        console.error('Failed to parse event:', err);
      }
    });

    ws.on('error', (error: Error) => {
      console.error('WebSocket error:', error.message);
      reject(error);
    });

    ws.on('close', () => {
      if (!hasSeenEvents) {
        console.log('No events received (session may have completed).');
      }
      resolve();
    });

    // Timeout after 10 seconds
    setTimeout(() => {
      ws.close();
      resolve();
    }, 10000);
  });
}

/**
 * Print a single event in a readable format.
 */
function printEvent(event: any): void {
  const timestamp = event.eventTimestamp
    ? new Date(event.eventTimestamp).toISOString().slice(11, 23)
    : '';

  const duration = event.cost?.duration_ms
    ? ` (${event.cost.duration_ms}ms)`
    : '';

  // Format event type for display
  const eventType = event.type.replace('TOC_', '').replace(/_/g, ' ').toLowerCase();

  console.log(`[${timestamp}] ${eventType}${duration}`);

  // Print relevant data fields
  if (event.data && Object.keys(event.data).length > 0) {
    const dataStr = formatEventData(event.data);
    if (dataStr) {
      console.log(`  ${dataStr}`);
    }
  }
}

/**
 * Format event data for display.
 */
function formatEventData(data: Record<string, any>): string {
  const relevant: string[] = [];

  if (data.fileName) relevant.push(`file: ${data.fileName}`);
  if (data.gcsPath) relevant.push(`path: ${data.gcsPath}`);
  if (data.sizeBytes) relevant.push(`size: ${(data.sizeBytes / 1024 / 1024).toFixed(2)}MB`);
  if (data.sandboxId) relevant.push(`sandbox: ${data.sandboxId.slice(0, 12)}...`);
  if (data.template) relevant.push(`template: ${data.template}`);
  if (data.strategy) relevant.push(`strategy: ${data.strategy}`);
  if (data.totalEntries !== undefined) relevant.push(`entries: ${data.totalEntries}`);
  if (data.exitCode !== undefined) relevant.push(`exit: ${data.exitCode}`);
  if (data.totalElapsedMs) relevant.push(`total: ${data.totalElapsedMs}ms`);

  return relevant.join(', ');
}

/**
 * Format TOC for output.
 */
export function formatTocOutput(
  result: TocResult,
  format: 'text' | 'json' | 'markdown' = 'text'
): string {
  if (format === 'json') {
    return JSON.stringify(result, null, 2);
  }

  if (format === 'markdown') {
    const lines: string[] = [];
    lines.push(`# Table of Contents\n`);
    lines.push(`_${result.file_name}_\n`);
    lines.push(`Strategy: ${result.strategy} | Pages: ${result.total_pages} | Entries: ${result.total_entries}\n`);

    for (const entry of result.toc) {
      const hashes = '#'.repeat(entry.level + 1);
      lines.push(`${hashes} ${entry.title} (p. ${entry.page})`);
    }

    return lines.join('\n');
  }

  // Text format
  const lines: string[] = [];
  lines.push(`File: ${result.file_name}`);
  lines.push(`Strategy: ${result.strategy}`);
  lines.push(`Entries: ${result.total_entries}`);
  lines.push(`Pages: ${result.total_pages}`);
  lines.push(`Elapsed: ${result.elapsed_ms}ms (total: ${result.total_elapsed_ms}ms)`);
  lines.push('');

  if (result.total_entries === 0) {
    lines.push('No table of contents found.');
    if (result.strategy === 'none') {
      lines.push('This PDF may not have bookmarks or a printed TOC page.');
    }
  } else {
    lines.push('Table of Contents:');
    lines.push('');

    for (const entry of result.toc) {
      const indent = '  '.repeat(entry.level - 1);
      const dots = '.'.repeat(Math.max(1, 60 - indent.length - entry.title.length));
      lines.push(`${indent}${entry.title} ${dots} ${entry.page}`);
    }
  }

  return lines.join('\n');
}

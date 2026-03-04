#!/usr/bin/env node
/**
 * okra CLI — Agent-friendly PDF extraction and collection queries.
 *
 * Global flags:
 *   -j, --json       Structured JSON output
 *   -q, --quiet      Suppress progress (just data to stdout)
 *   -o, --output     Write output to file (CSV/JSON)
 *
 * Action commands (agent-grade):
 *   okra upload <source>                            # Upload + wait
 *   okra collection list                            # List collections
 *   okra collection query <name> "<question>"       # Fan-out → CSV
 *
 * Review commands (existing):
 *   okra tree / find / page / search / tables / history / toc
 *
 * Exit codes: 0=success, 1=client error, 2=server error
 */

import { Command } from 'commander';
import { OkraClient } from '../client';
import {
  tree,
  formatTreeOutput,
  find,
  formatFindOutput,
  formatStats,
  pageGet,
  pageEdit,
  pageResolve,
  pageVersions,
  formatPageOutput,
  formatVersionsOutput,
  search,
  formatSearchOutput,
  tables,
  formatTablesOutput,
  history,
  formatHistoryOutput,
  toc,
  formatTocOutput,
  authLogin,
  authStatus,
  authLogout,
  upload,
  collectionList,
  collectionSetVisibility,
  collectionQueryRaw,
  formatCollectionList,
  formatCollectionCsv,
  formatCollectionTable,
  formatQueryJsonl,
} from './commands';
import { getApiKey, getBaseUrl } from './config';
import { handleError, writeOutput, progress } from './output';
import type { GlobalFlags } from './output';

const program = new Command();

program
  .name('okra')
  .description('OkraPDF CLI — upload PDFs, query collections, extract data')
  .version('0.9.0')
  .option('-j, --json', 'Output JSON (structured, machine-readable)')
  .option('-q, --quiet', 'Suppress progress and human-readable frills')
  .option('-o, --output <file>', 'Write output to file instead of stdout');

/** Read global flags from program.opts(). */
function globals(): GlobalFlags {
  return program.opts();
}

// Create client with proper config priority:
// 1. Environment variable (OKRA_API_KEY)
// 2. Project config (.okrarc, .okra.json)
// 3. Global config (~/.okra/config.json)
function getClient(): OkraClient {
  const apiKey = getApiKey();
  const baseUrl = getBaseUrl();

  if (!apiKey) {
    const g = globals();
    if (g.json) {
      process.stderr.write(JSON.stringify({ error: 'No API key found', code: 401 }) + '\n');
    } else {
      process.stderr.write(
        'No API key found.\n\n' +
        '  Get one: https://okrapdf.dev/api-keys\n' +
        '  Then:    export OKRA_API_KEY="okra_xxx"\n' +
        '  Or:      npx okra auth login\n\n' +
        '  Docs:    https://okrapdf.dev/docs\n' +
        '  Discord: https://discord.gg/BHNmbZVs\n',
      );
    }
    process.exit(1);
  }

  return new OkraClient({ apiKey, baseUrl });
}

// ============================================================================
// upload command
// ============================================================================
program
  .command('upload <source>')
  .description('Upload a PDF (file path or URL), wait for processing')
  .option('--no-wait', 'Fire-and-forget (don\'t wait for processing)')
  .action(async (source, options) => {
    const g = globals();
    try {
      const client = getClient();
      const result = await upload(client, source, {
        ...g,
        noWait: options.wait === false,
      });

      if (g.json) {
        writeOutput(JSON.stringify(result), g.output);
      } else {
        const lines = [`Done — ${result.pages ?? '?'} pages`, ''];
        lines.push(`  ${result.id}`);
        if (result.urls) {
          const short = result.id.slice(0, 11) + '...';
          lines.push('');
          lines.push(`  Markdown:   ${result.urls.full_md.replace(result.id, short)}`);
          lines.push(`  Page 1:     ${result.urls.page_png.replace(result.id, short).replace('{N}', '1')}`);
          lines.push(`  Completion: ${result.urls.completion.replace(result.id, short)}`);
          lines.push('');
          lines.push('  URL patterns:');
          lines.push('    /v1/documents/{id}/pg_{N}.md             page markdown');
          lines.push('    /v1/documents/{id}/d_shimmer/pg_{N}.png  page image');
          lines.push('    /v1/documents/{id}/full.md               full document');
          lines.push('');
          lines.push('  Docs: https://okrapdf.dev/docs  Discord: https://discord.gg/BHNmbZVs');
        }
        writeOutput(lines.join('\n'), g.output);
      }
    } catch (error) {
      handleError(error, g.json);
    }
  });

// ============================================================================
// collection command
// ============================================================================
const collectionCmd = program.command('collection').description('Collection operations');

collectionCmd
  .command('list')
  .description('List available collections')
  .action(async () => {
    const g = globals();
    try {
      const client = getClient();
      const rows = await collectionList(client, g);
      writeOutput(formatCollectionList(rows, g.json), g.output);
    } catch (error) {
      handleError(error, g.json);
    }
  });

collectionCmd
  .command('query <nameOrId> <question>')
  .description('Fan-out query across collection documents')
  .option('--schema <file>', 'JSON Schema file for structured extraction')
  .action(async (nameOrId, question, options) => {
    const g = globals();
    try {
      const apiKey = getApiKey();
      const baseUrl = getBaseUrl();
      if (!apiKey) {
        handleError(new Error('No API key found'), g.json);
      }

      const { results, summary } = await collectionQueryRaw(
        baseUrl!,
        apiKey!,
        nameOrId,
        question,
        { ...g, schema: options.schema },
      );

      // Determine output format based on flags
      if (g.json) {
        // --json: JSONL events to stdout
        writeOutput(formatQueryJsonl(results), g.output);
      } else if (g.output && g.output.endsWith('.csv')) {
        // -o file.csv → CSV
        writeOutput(formatCollectionCsv(results), g.output);
      } else if (g.output) {
        // -o file.json or other → JSON
        writeOutput(JSON.stringify({ results, summary }), g.output);
      } else {
        // Default: compact table to stdout
        writeOutput(formatCollectionTable(results));
      }

      progress(
        `${summary.completed} completed, ${summary.failed} failed — $${summary.total_cost_usd.toFixed(4)}`,
        g.quiet,
      );
    } catch (error) {
      handleError(error, g.json);
    }
  });

collectionCmd
  .command('publish <nameOrId>')
  .description('Make a collection publicly queryable')
  .action(async (nameOrId) => {
    const g = globals();
    try {
      const client = getClient();
      await collectionSetVisibility(client, nameOrId, 'public');
      if (g.json) {
        writeOutput(JSON.stringify({ ok: true, visibility: 'public', collection: nameOrId }), g.output);
      } else {
        writeOutput(
          `Published "${nameOrId}"\n` +
          `Share with: okra collection query ${nameOrId} "your question"`,
          g.output,
        );
      }
    } catch (error) {
      handleError(error, g.json);
    }
  });

collectionCmd
  .command('unpublish <nameOrId>')
  .description('Make a collection private (owner-only)')
  .action(async (nameOrId) => {
    const g = globals();
    try {
      const client = getClient();
      await collectionSetVisibility(client, nameOrId, 'private');
      if (g.json) {
        writeOutput(JSON.stringify({ ok: true, visibility: 'private', collection: nameOrId }), g.output);
      } else {
        writeOutput(`Unpublished "${nameOrId}" — now private`, g.output);
      }
    } catch (error) {
      handleError(error, g.json);
    }
  });

// ============================================================================
// auth command - Authentication management
// ============================================================================
const authCmd = program.command('auth').description('Manage authentication');

authCmd
  .command('login')
  .description('Save API key to global config')
  .action(async () => {
    try {
      await authLogin();
    } catch (error) {
      handleError(error, globals().json);
    }
  });

authCmd
  .command('status')
  .description('Show authentication status')
  .action(async () => {
    try {
      await authStatus();
    } catch (error) {
      handleError(error, globals().json);
    }
  });

authCmd
  .command('logout')
  .description('Remove API key from global config')
  .action(async () => {
    try {
      await authLogout();
    } catch (error) {
      handleError(error, globals().json);
    }
  });

// ============================================================================
// tree command - Document verification tree
// ============================================================================
program
  .command('tree <jobId>')
  .description('Show document verification tree')
  .option('-s, --status <status>', 'Filter by status (complete|partial|pending|flagged|empty|gap)')
  .option('-e, --entity <type>', 'Filter by entity type (table|figure|footnote)')
  .option('-f, --format <format>', 'Output format (text|json|markdown)', 'text')
  .action(async (jobId, options) => {
    const g = globals();
    try {
      const client = getClient();
      const fmt = g.json ? 'json' : options.format;
      const result = await tree(client, jobId, {
        status: options.status,
        entity: options.entity,
      });
      writeOutput(formatTreeOutput(result, fmt), g.output);
    } catch (error) {
      handleError(error, g.json);
    }
  });

// ============================================================================
// find command - jQuery-like entity search
// ============================================================================
program
  .command('find <jobId> <selector>')
  .description('Find entities using jQuery-like selectors')
  .option('-k, --top-k <n>', 'Limit results', parseInt)
  .option('-c, --min-confidence <n>', 'Minimum confidence (0-1)', parseFloat)
  .option('-p, --pages <range>', 'Page range (e.g., 1-10)')
  .option('--sort <by>', 'Sort by (confidence|page|type)')
  .option('--stats', 'Show aggregate statistics')
  .option('-f, --format <format>', 'Output format (text|json|entities|ids)', 'text')
  .action(async (jobId, selector, options) => {
    const g = globals();
    try {
      const client = getClient();
      const fmt = g.json ? 'json' : options.format;
      const pageRange = options.pages
        ? options.pages.split('-').map(Number) as [number, number]
        : undefined;

      const result = await find(client, jobId, selector, {
        topK: options.topK,
        minConfidence: options.minConfidence,
        pageRange,
        sortBy: options.sort,
      });

      if (options.stats && fmt === 'text') {
        writeOutput(formatStats(result.stats), g.output);
      } else {
        writeOutput(formatFindOutput(result, fmt, options.stats), g.output);
      }
    } catch (error) {
      handleError(error, g.json);
    }
  });

// ============================================================================
// page command - Page content operations
// ============================================================================
const pageCmd = program.command('page').description('Page content operations');

pageCmd
  .command('get <jobId> <pageNum>')
  .description('Get page content')
  .option('-v, --version <n>', 'Specific version', parseInt)
  .option('-f, --format <format>', 'Output format (text|json|markdown)', 'markdown')
  .action(async (jobId, pageNum, options) => {
    const g = globals();
    try {
      const client = getClient();
      const fmt = g.json ? 'json' : options.format;
      const content = await pageGet(client, jobId, parseInt(pageNum), {
        version: options.version,
      });
      writeOutput(formatPageOutput(content, fmt), g.output);
    } catch (error) {
      handleError(error, g.json);
    }
  });

pageCmd
  .command('edit <jobId> <pageNum>')
  .description('Edit page content (reads from stdin)')
  .action(async (jobId, pageNum) => {
    const g = globals();
    try {
      const chunks: Buffer[] = [];
      for await (const chunk of process.stdin) {
        chunks.push(chunk);
      }
      const content = Buffer.concat(chunks).toString('utf8');

      const client = getClient();
      const result = await pageEdit(client, jobId, parseInt(pageNum), content);
      if (g.json) {
        writeOutput(JSON.stringify({ version: result.version }), g.output);
      } else {
        writeOutput(`Saved as version ${result.version}`, g.output);
      }
    } catch (error) {
      handleError(error, g.json);
    }
  });

pageCmd
  .command('resolve <jobId> <pageNum> <resolution>')
  .description('Resolve page verification status')
  .option('-c, --classification <class>', 'Classification')
  .option('-r, --reason <reason>', 'Reason')
  .action(async (jobId, pageNum, resolution, options) => {
    const g = globals();
    try {
      const client = getClient();
      const result = await pageResolve(client, jobId, parseInt(pageNum), {
        resolution,
        classification: options.classification,
        reason: options.reason,
      });
      if (g.json) {
        writeOutput(JSON.stringify({ success: result.success }), g.output);
      } else {
        writeOutput(result.success ? 'Resolved' : 'Failed', g.output);
      }
    } catch (error) {
      handleError(error, g.json);
    }
  });

pageCmd
  .command('versions <jobId> <pageNum>')
  .description('List page versions')
  .option('-f, --format <format>', 'Output format (text|json)', 'text')
  .action(async (jobId, pageNum, options) => {
    const g = globals();
    try {
      const client = getClient();
      const fmt = g.json ? 'json' : options.format;
      const versions = await pageVersions(client, jobId, parseInt(pageNum));
      writeOutput(formatVersionsOutput(versions, fmt), g.output);
    } catch (error) {
      handleError(error, g.json);
    }
  });

// ============================================================================
// search command - Full-text search
// ============================================================================
program
  .command('search <jobId> <query>')
  .description('Search page content')
  .option('-f, --format <format>', 'Output format (text|json)', 'text')
  .action(async (jobId, query, options) => {
    const g = globals();
    try {
      const client = getClient();
      const fmt = g.json ? 'json' : options.format;
      const result = await search(client, jobId, query);
      writeOutput(formatSearchOutput(result, fmt), g.output);
    } catch (error) {
      handleError(error, g.json);
    }
  });

// ============================================================================
// tables command - List tables
// ============================================================================
program
  .command('tables <jobId>')
  .description('List extracted tables')
  .option('-p, --page <n>', 'Filter by page', parseInt)
  .option('-s, --status <status>', 'Filter by status (pending|verified|flagged|rejected)')
  .option('-f, --format <format>', 'Output format (text|json|markdown)', 'text')
  .action(async (jobId, options) => {
    const g = globals();
    try {
      const client = getClient();
      const fmt = g.json ? 'json' : options.format;
      const result = await tables(client, jobId, {
        page: options.page,
        status: options.status,
      });
      writeOutput(formatTablesOutput(result, fmt), g.output);
    } catch (error) {
      handleError(error, g.json);
    }
  });

// ============================================================================
// history command - Verification audit trail
// ============================================================================
program
  .command('history <jobId>')
  .description('Show verification history')
  .option('-l, --limit <n>', 'Limit entries', parseInt, 50)
  .option('-f, --format <format>', 'Output format (text|json)', 'text')
  .action(async (jobId, options) => {
    const g = globals();
    try {
      const client = getClient();
      const fmt = g.json ? 'json' : options.format;
      const result = await history(client, jobId, { limit: options.limit });
      writeOutput(formatHistoryOutput(result, fmt), g.output);
    } catch (error) {
      handleError(error, g.json);
    }
  });

// ============================================================================
// toc command - Table of contents extraction
// ============================================================================
program
  .command('toc <jobId>')
  .description('Extract table of contents from PDF')
  .option('--max-depth <n>', 'Maximum TOC depth', parseInt)
  .option('-f, --format <format>', 'Output format (text|json|markdown)', 'text')
  .option('--watch', 'Watch live extraction events via WebSocket')
  .action(async (jobId, options) => {
    const g = globals();
    try {
      const client = getClient();
      const fmt = g.json ? 'json' : options.format;
      const result = await toc(client, jobId, {
        maxDepth: options.maxDepth,
        watch: options.watch,
      });
      writeOutput(formatTocOutput(result, fmt), g.output);
    } catch (error) {
      handleError(error, g.json);
    }
  });

program.parse();

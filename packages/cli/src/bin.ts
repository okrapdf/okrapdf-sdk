#!/usr/bin/env node
/**
 * okra CLI - Command line interface for OkraPDF review operations
 *
 * Usage:
 *   okra tree <jobId>                           # Document verification tree
 *   okra find <jobId> <selector>                # jQuery-like entity search
 *   okra page get <jobId> <pageNum>             # Get page content
 *   okra page edit <jobId> <pageNum> <content>  # Edit page content
 *   okra page resolve <jobId> <pageNum> <res>   # Resolve page status
 *   okra search <jobId> <query>                 # Full-text search
 *   okra tables <jobId>                         # List tables
 *   okra history <jobId>                        # Verification history
 */

import { Command } from 'commander';
import { OkraClient } from '@okrapdf/sdk';
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
} from './commands';

const program = new Command();

// Create client (uses OKRA_API_KEY env var by default)
function getClient(): OkraClient {
  return new OkraClient({
    apiKey: process.env.OKRA_API_KEY,
    baseUrl: process.env.OKRA_BASE_URL || 'https://app.okrapdf.com',
  });
}

program
  .name('okra')
  .description('CLI for OkraPDF document review operations')
  .version('0.1.0');

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
    try {
      const client = getClient();
      const result = await tree(client, jobId, {
        status: options.status,
        entity: options.entity,
      });
      console.log(formatTreeOutput(result, options.format));
    } catch (error: any) {
      console.error('Error:', error.message);
      process.exit(1);
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
    try {
      const client = getClient();
      const pageRange = options.pages
        ? options.pages.split('-').map(Number) as [number, number]
        : undefined;

      const result = await find(client, jobId, selector, {
        topK: options.topK,
        minConfidence: options.minConfidence,
        pageRange,
        sortBy: options.sort,
      });

      if (options.stats && options.format === 'text') {
        console.log(formatStats(result.stats));
      } else {
        console.log(formatFindOutput(result, options.format, options.stats));
      }
    } catch (error: any) {
      console.error('Error:', error.message);
      process.exit(1);
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
    try {
      const client = getClient();
      const content = await pageGet(client, jobId, parseInt(pageNum), {
        version: options.version,
      });
      console.log(formatPageOutput(content, options.format));
    } catch (error: any) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  });

pageCmd
  .command('edit <jobId> <pageNum>')
  .description('Edit page content (reads from stdin)')
  .action(async (jobId, pageNum) => {
    try {
      // Read content from stdin
      const chunks: Buffer[] = [];
      for await (const chunk of process.stdin) {
        chunks.push(chunk);
      }
      const content = Buffer.concat(chunks).toString('utf8');

      const client = getClient();
      const result = await pageEdit(client, jobId, parseInt(pageNum), content);
      console.log(`Saved as version ${result.version}`);
    } catch (error: any) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  });

pageCmd
  .command('resolve <jobId> <pageNum> <resolution>')
  .description('Resolve page verification status')
  .option('-c, --classification <class>', 'Classification')
  .option('-r, --reason <reason>', 'Reason')
  .action(async (jobId, pageNum, resolution, options) => {
    try {
      const client = getClient();
      const result = await pageResolve(client, jobId, parseInt(pageNum), {
        resolution,
        classification: options.classification,
        reason: options.reason,
      });
      console.log(result.success ? 'Resolved' : 'Failed');
    } catch (error: any) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  });

pageCmd
  .command('versions <jobId> <pageNum>')
  .description('List page versions')
  .option('-f, --format <format>', 'Output format (text|json)', 'text')
  .action(async (jobId, pageNum, options) => {
    try {
      const client = getClient();
      const versions = await pageVersions(client, jobId, parseInt(pageNum));
      console.log(formatVersionsOutput(versions, options.format));
    } catch (error: any) {
      console.error('Error:', error.message);
      process.exit(1);
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
    try {
      const client = getClient();
      const result = await search(client, jobId, query);
      console.log(formatSearchOutput(result, options.format));
    } catch (error: any) {
      console.error('Error:', error.message);
      process.exit(1);
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
    try {
      const client = getClient();
      const result = await tables(client, jobId, {
        page: options.page,
        status: options.status,
      });
      console.log(formatTablesOutput(result, options.format));
    } catch (error: any) {
      console.error('Error:', error.message);
      process.exit(1);
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
    try {
      const client = getClient();
      const result = await history(client, jobId, { limit: options.limit });
      console.log(formatHistoryOutput(result, options.format));
    } catch (error: any) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  });

program.parse();

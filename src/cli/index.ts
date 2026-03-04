/**
 * @okrapdf/cli - CLI for OkraPDF document review operations
 *
 * This package provides both a CLI tool and programmatic API for
 * interacting with OkraPDF document review features.
 *
 * CLI Usage:
 *   okra tree <jobId>                           # Document verification tree
 *   okra find <jobId> <selector>                # jQuery-like entity search
 *   okra page get <jobId> <pageNum>             # Get page content
 *   okra search <jobId> <query>                 # Full-text search
 *   okra tables <jobId>                         # List tables
 *   okra history <jobId>                        # Verification history
 *
 * Programmatic Usage:
 *   import { OkraClient } from '@okrapdf/okrapdf';
 *   import { tree, find, pageGet } from '@okrapdf/okrapdf/cli';
 *
 *   const client = new OkraClient({ apiKey: 'okra_xxx' });
 *   const treeData = await tree(client, 'ocr-xxx');
 *   const entities = await find(client, 'ocr-xxx', '.table[confidence>0.9]');
 *   const content = await pageGet(client, 'ocr-xxx', 1);
 */

// Export types
export * from './types';

// Export query engine
export {
  parseSelector,
  filterEntities,
  executeQuery,
  calculateStats,
  type SelectorParts,
  type QueryOptions,
  type QueryStats,
  type QueryResult,
} from './query-engine';

// Export commands
export {
  // Tree command (Left panel)
  tree,
  formatTreeOutput,
  type TreeOptions,
  type TreeResult,
  // Find command (Middle panel - entity search)
  find,
  formatFindOutput,
  formatStats,
  type FindOptions,
  // Page commands (Right panel)
  pageGet,
  pageEdit,
  pageResolve,
  pageVersions,
  formatPageOutput,
  formatVersionsOutput,
  type PageGetOptions,
  type PageResolveOptions,
  // Search command
  search,
  formatSearchOutput,
  type SearchOptions,
  // Tables command
  tables,
  formatTablesOutput,
  type TablesOptions,
  // History command
  history,
  formatHistoryOutput,
  type HistoryOptions,
  // TOC command
  toc,
  formatTocOutput,
  type TocOptions,
  // Auth commands
  authLogin,
  authStatus,
  authLogout,
} from './commands';

// Export config utilities
export {
  getApiKey,
  getBaseUrl,
  getApiKeySource,
  getGlobalConfigPath,
  getGlobalConfigDir,
  readGlobalConfig,
  writeGlobalConfig,
  readProjectConfig,
  type OkraConfig,
} from './config';

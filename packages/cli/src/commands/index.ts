/**
 * CLI Commands Index
 *
 * Exports all commands for the okra CLI.
 * Each command maps to a review page UI panel interaction.
 */

// Left Panel - Document Tree
export { tree, formatTreeOutput, type TreeOptions, type TreeResult } from './tree';

// Middle Panel - Entity Search (jQuery-like)
export { find, formatFindOutput, formatStats, type FindOptions } from './find';

// Right Panel - Page Content
export {
  pageGet,
  pageEdit,
  pageResolve,
  pageVersions,
  formatPageOutput,
  formatVersionsOutput,
  type PageGetOptions,
  type PageResolveOptions,
} from './page';

// Search
export { search, formatSearchOutput, type SearchOptions } from './search';

// Tables
export { tables, formatTablesOutput, type TablesOptions } from './tables';

// History
export { history, formatHistoryOutput, type HistoryOptions } from './history';

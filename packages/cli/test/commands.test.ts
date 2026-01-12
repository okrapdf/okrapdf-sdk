/**
 * Tests for CLI commands - format outputs
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  formatTreeOutput,
  formatFindOutput,
  formatStats,
  formatPageOutput,
  formatVersionsOutput,
  formatSearchOutput,
  formatTablesOutput,
  formatHistoryOutput,
} from '../src/commands';
import type {
  VerificationTreeResponse,
  Entity,
  PageContentResponse,
  PageVersionsResponse,
  SearchResponse,
  TablesResponse,
  HistoryResponse,
} from '@okrapdf/sdk';

// Mock data
const mockTree: VerificationTreeResponse = {
  jobId: 'ocr-test-123',
  documentId: 'doc-456',
  totalPages: 10,
  summary: {
    complete: 5,
    partial: 2,
    pending: 1,
    flagged: 1,
    empty: 0,
    gap: 1,
  },
  pages: [
    { page: 1, status: 'complete', total: 3, verified: 3, pending: 0, flagged: 0, rejected: 0, avgConfidence: 0.95, hasOcr: true, ocrLineCount: 50, hasCoverageGaps: false, uncoveredCount: 0, resolution: null, classification: null, isStale: false },
    { page: 2, status: 'pending', total: 2, verified: 0, pending: 2, flagged: 0, rejected: 0, avgConfidence: 0.8, hasOcr: true, ocrLineCount: 30, hasCoverageGaps: false, uncoveredCount: 0, resolution: null, classification: null, isStale: false },
    { page: 3, status: 'gap', total: 0, verified: 0, pending: 0, flagged: 0, rejected: 0, avgConfidence: 0, hasOcr: true, ocrLineCount: 20, hasCoverageGaps: true, uncoveredCount: 5, resolution: null, classification: null, isStale: false },
  ],
};

const mockEntities: Entity[] = [
  { id: 'table-1', type: 'table', title: 'Revenue Table', page: 1, confidence: 0.95 },
  { id: 'figure-1', type: 'figure', title: 'Chart A', page: 2, confidence: 0.9 },
];

const mockPageContent: PageContentResponse = {
  page: 1,
  content: '# Page 1\n\nThis is the content.',
  version: 2,
};

const mockVersions: PageVersionsResponse = {
  page: 1,
  current_version: 2,
  versions: [
    { version: 1, edit_source: 'ocr_extraction', created_at: '2024-01-01T00:00:00Z', preview: 'Initial OCR' },
    { version: 2, edit_source: 'user_edit', created_at: '2024-01-02T00:00:00Z', preview: 'User edited' },
  ],
};

const mockSearchResponse: SearchResponse = {
  query: 'revenue',
  total_matches: 5,
  results: [
    { page: 1, snippet: 'Total revenue for Q1...', match_count: 3, match_source: 'content' },
    { page: 5, snippet: 'Revenue breakdown...', match_count: 2, match_source: 'table_title' },
  ],
};

const mockTables: TablesResponse = {
  tables: [
    {
      id: 'table-1',
      page_number: 1,
      markdown: '| A | B |\n|---|---|\n| 1 | 2 |',
      bbox: { xmin: 0.1, ymin: 0.1, xmax: 0.9, ymax: 0.3 },
      confidence: 0.95,
      verification_status: 'verified',
      verified_by: 'user-1',
      verified_at: '2024-01-01T00:00:00Z',
      created_at: '2024-01-01T00:00:00Z',
    },
    {
      id: 'table-2',
      page_number: 2,
      markdown: '| X | Y |\n|---|---|\n| a | b |',
      bbox: { xmin: 0.1, ymin: 0.2, xmax: 0.9, ymax: 0.4 },
      confidence: 0.8,
      verification_status: 'pending',
      verified_by: null,
      verified_at: null,
      created_at: '2024-01-01T00:00:00Z',
    },
  ],
  source: 'job_id',
};

const mockHistory: HistoryResponse = {
  history: [
    {
      id: 'h-1',
      entityType: 'table',
      entityId: 'table-1',
      state: 'verified',
      previousState: 'pending',
      transitionName: 'verify',
      triggeredBy: 'user-1',
      triggeredByName: 'John',
      reason: null,
      resolution: null,
      classification: null,
      pageNum: 1,
      createdAt: '2024-01-01T12:00:00Z',
    },
  ],
};

describe('formatTreeOutput', () => {
  it('formats as JSON', () => {
    const result = { tree: mockTree, filteredPages: [1, 2, 3] };
    const output = formatTreeOutput(result, 'json');
    expect(JSON.parse(output)).toEqual(result);
  });

  it('formats as text', () => {
    const result = { tree: mockTree, filteredPages: [1, 2, 3] };
    const output = formatTreeOutput(result, 'text');
    expect(output).toContain('Verification Tree: ocr-test-123');
    expect(output).toContain('Total Pages: 10');
    expect(output).toContain('Complete: 5');
    expect(output).toContain('✓ p  1');
    expect(output).toContain('○ p  2');
    expect(output).toContain('! p  3');
  });

  it('formats as markdown', () => {
    const result = { tree: mockTree, filteredPages: [1, 2, 3] };
    const output = formatTreeOutput(result, 'markdown');
    expect(output).toContain('# Verification Tree: ocr-test-123');
    expect(output).toContain('| Status | Count |');
    expect(output).toContain('| Complete | 5 |');
  });
});

describe('formatFindOutput', () => {
  const queryResult = {
    entities: mockEntities,
    total: 2,
    stats: {
      total: 2,
      byType: { table: 1, figure: 1 },
      byPage: { 1: 1, 2: 1 },
      avgConfidence: 0.925,
      minConfidence: 0.9,
      maxConfidence: 0.95,
    },
  };

  it('formats as JSON', () => {
    const output = formatFindOutput(queryResult, 'json');
    expect(JSON.parse(output)).toEqual(mockEntities);
  });

  it('formats as ids', () => {
    const output = formatFindOutput(queryResult, 'ids');
    expect(output).toBe('table-1\nfigure-1');
  });

  it('formats as entities (TSV)', () => {
    const output = formatFindOutput(queryResult, 'entities');
    expect(output).toContain('table\t1\ttable-1\tRevenue Table');
    expect(output).toContain('figure\t2\tfigure-1\tChart A');
  });

  it('formats as text', () => {
    const output = formatFindOutput(queryResult, 'text');
    expect(output).toContain('Found 2 entities');
    expect(output).toContain('[p1] table "Revenue Table" (95%)');
    expect(output).toContain('[p2] figure "Chart A" (90%)');
  });

  it('includes stats when requested', () => {
    const output = formatFindOutput(queryResult, 'text', true);
    expect(output).toContain('Stats:');
    expect(output).toContain('By Type:');
    expect(output).toContain('table: 1');
  });
});

describe('formatStats', () => {
  const stats = {
    total: 100,
    byType: { table: 50, figure: 30, footnote: 20 },
    byPage: { 1: 10, 2: 15, 3: 25 },
    avgConfidence: 0.85,
    minConfidence: 0.6,
    maxConfidence: 0.99,
  };

  it('formats stats summary', () => {
    const output = formatStats(stats);
    expect(output).toContain('Total: 100');
    expect(output).toContain('table');
    expect(output).toContain('50');
    expect(output).toContain('Average: 85.0%');
    expect(output).toContain('Min:     60.0%');
    expect(output).toContain('Max:     99.0%');
  });
});

describe('formatPageOutput', () => {
  it('formats as markdown (raw content)', () => {
    const output = formatPageOutput(mockPageContent, 'markdown');
    expect(output).toBe('# Page 1\n\nThis is the content.');
  });

  it('formats as JSON', () => {
    const output = formatPageOutput(mockPageContent, 'json');
    expect(JSON.parse(output)).toEqual(mockPageContent);
  });

  it('formats as text with metadata', () => {
    const output = formatPageOutput(mockPageContent, 'text');
    expect(output).toContain('Page 1');
    expect(output).toContain('Version: 2');
    expect(output).toContain('---');
    expect(output).toContain('# Page 1');
  });
});

describe('formatVersionsOutput', () => {
  it('formats as JSON', () => {
    const output = formatVersionsOutput(mockVersions, 'json');
    expect(JSON.parse(output)).toEqual(mockVersions);
  });

  it('formats as text', () => {
    const output = formatVersionsOutput(mockVersions, 'text');
    expect(output).toContain('Page 1 - 2 versions');
    expect(output).toContain('Current: v2');
    expect(output).toContain('v1 [ocr_extraction]');
    expect(output).toContain('v2 * [user_edit]');
  });
});

describe('formatSearchOutput', () => {
  it('formats as JSON', () => {
    const output = formatSearchOutput(mockSearchResponse, 'json');
    expect(JSON.parse(output)).toEqual(mockSearchResponse);
  });

  it('formats as text', () => {
    const output = formatSearchOutput(mockSearchResponse, 'text');
    expect(output).toContain('Search: "revenue"');
    expect(output).toContain('Found 5 matches in 2 pages');
    expect(output).toContain('p  1 (3 matches) [content]');
    expect(output).toContain('p  5 (2 matches) [table_title]');
  });
});

describe('formatTablesOutput', () => {
  it('formats as JSON', () => {
    const output = formatTablesOutput(mockTables, 'json');
    expect(JSON.parse(output)).toEqual(mockTables);
  });

  it('formats as markdown', () => {
    const output = formatTablesOutput(mockTables, 'markdown');
    expect(output).toContain('## Table (p1)');
    expect(output).toContain('| A | B |');
    expect(output).toContain('## Table (p2)');
  });

  it('formats as text', () => {
    const output = formatTablesOutput(mockTables, 'text');
    expect(output).toContain('Tables: 2');
    expect(output).toContain('Page 1:');
    expect(output).toContain('✓ table-1 (95%)');
    expect(output).toContain('Page 2:');
    expect(output).toContain('○ table-2 (80%)');
  });
});

describe('formatHistoryOutput', () => {
  it('formats as JSON', () => {
    const output = formatHistoryOutput(mockHistory, 'json');
    expect(JSON.parse(output)).toEqual(mockHistory);
  });

  it('formats as text', () => {
    const output = formatHistoryOutput(mockHistory, 'text');
    expect(output).toContain('History: 1 entries');
    expect(output).toContain('table p1');
    expect(output).toContain('verify by John');
  });
});

/**
 * Tests for the query engine - jQuery-like entity selector
 */

import { describe, it, expect } from 'vitest';
import {
  parseSelector,
  filterEntities,
  executeQuery,
  calculateStats,
} from '../src/query-engine';
import type { Entity } from '../src/types';

// Test fixtures
const mockEntities: Entity[] = [
  { id: 'table-1', type: 'table', title: 'Revenue Table', page: 1, confidence: 0.95 },
  { id: 'table-2', type: 'table', title: 'Expenses', page: 2, confidence: 0.85 },
  { id: 'table-3', type: 'table', title: 'Summary', page: 5, confidence: 0.7 },
  { id: 'figure-1', type: 'figure', title: 'Chart A', page: 1, confidence: 0.9 },
  { id: 'figure-2', type: 'figure', title: 'Chart B', page: 3, confidence: 0.8 },
  { id: 'footnote-1', type: 'footnote', title: 'Note 1', page: 1, confidence: 0.99 },
  { id: 'footnote-2', type: 'footnote', title: 'Note 2', page: 4, confidence: 0.6 },
];

describe('parseSelector', () => {
  it('parses type selectors', () => {
    const result = parseSelector('.table');
    expect(result.types).toEqual(['table']);
  });

  it('parses multiple type selectors (OR)', () => {
    const result = parseSelector('.table, .figure');
    expect(result.types).toEqual(['table', 'figure']);
  });

  it('parses page filter (single)', () => {
    const result = parseSelector('.table:page(5)');
    expect(result.types).toEqual(['table']);
    expect(result.pageFilter).toEqual({ type: 'single', value: 5 });
  });

  it('parses page filter (range)', () => {
    const result = parseSelector('.table:pages(1-10)');
    expect(result.pageFilter).toEqual({ type: 'range', value: [1, 10] });
  });

  it('parses confidence filter', () => {
    const result = parseSelector('[confidence>0.9]');
    expect(result.confidenceFilter).toEqual({ op: '>', value: 0.9 });
  });

  it('parses confidence filter with >= operator', () => {
    const result = parseSelector('[confidence>=0.8]');
    expect(result.confidenceFilter).toEqual({ op: '>=', value: 0.8 });
  });

  it('parses verification filter', () => {
    const result = parseSelector('[status=pending]');
    expect(result.verificationFilter).toBe('pending');
  });

  it('parses contains filter', () => {
    const result = parseSelector(':contains(Revenue)');
    expect(result.textContains).toBe('Revenue');
  });

  it('parses complex selector', () => {
    const result = parseSelector('.table[confidence>=0.8]:page(1-10)');
    expect(result.types).toEqual(['table']);
    expect(result.confidenceFilter).toEqual({ op: '>=', value: 0.8 });
    expect(result.pageFilter).toEqual({ type: 'range', value: [1, 10] });
  });

  it('parses wildcard selector', () => {
    const result = parseSelector('*');
    expect(result.types).toHaveLength(6);
    expect(result.types).toContain('table');
    expect(result.types).toContain('figure');
  });
});

describe('filterEntities', () => {
  it('filters by type', () => {
    const parts = parseSelector('.table');
    const result = filterEntities(mockEntities, parts);
    expect(result).toHaveLength(3);
    expect(result.every((e) => e.type === 'table')).toBe(true);
  });

  it('filters by multiple types', () => {
    const parts = parseSelector('.table, .figure');
    const result = filterEntities(mockEntities, parts);
    expect(result).toHaveLength(5);
  });

  it('filters by page', () => {
    const parts = parseSelector('.table:page(1)');
    const result = filterEntities(mockEntities, parts);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('table-1');
  });

  it('filters by page range', () => {
    const parts = parseSelector(':pages(1-3)');
    const result = filterEntities(mockEntities, parts);
    expect(result).toHaveLength(5);
    expect(result.every((e) => e.page >= 1 && e.page <= 3)).toBe(true);
  });

  it('filters by confidence', () => {
    const parts = parseSelector('[confidence>0.9]');
    const result = filterEntities(mockEntities, parts);
    expect(result).toHaveLength(2);
    expect(result.every((e) => (e.confidence ?? 0) > 0.9)).toBe(true);
  });

  it('filters by text contains', () => {
    const parts = parseSelector(':contains(Chart)');
    const result = filterEntities(mockEntities, parts);
    expect(result).toHaveLength(2);
    expect(result.every((e) => e.title?.includes('Chart'))).toBe(true);
  });

  it('filters by text contains (case insensitive)', () => {
    const parts = parseSelector(':contains(revenue)');
    const result = filterEntities(mockEntities, parts);
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('Revenue Table');
  });
});

describe('executeQuery', () => {
  it('executes a basic query', () => {
    const result = executeQuery(mockEntities, '.table');
    expect(result.total).toBe(3);
    expect(result.entities).toHaveLength(3);
  });

  it('applies topK limit', () => {
    const result = executeQuery(mockEntities, '*', { topK: 3 });
    expect(result.entities).toHaveLength(3);
    expect(result.total).toBe(3);
  });

  it('sorts by confidence', () => {
    const result = executeQuery(mockEntities, '*', { sortBy: 'confidence' });
    expect(result.entities[0].confidence).toBe(0.99);
    expect(result.entities[1].confidence).toBe(0.95);
  });

  it('sorts by page', () => {
    const result = executeQuery(mockEntities, '*', { sortBy: 'page' });
    expect(result.entities[0].page).toBe(1);
    expect(result.entities[result.entities.length - 1].page).toBe(5);
  });

  it('applies minConfidence filter', () => {
    const result = executeQuery(mockEntities, '*', { minConfidence: 0.9 });
    expect(result.entities.every((e) => (e.confidence ?? 0) >= 0.9)).toBe(true);
  });

  it('applies pageRange filter', () => {
    const result = executeQuery(mockEntities, '*', { pageRange: [1, 2] });
    expect(result.entities.every((e) => e.page >= 1 && e.page <= 2)).toBe(true);
  });

  it('calculates stats', () => {
    const result = executeQuery(mockEntities, '*');
    expect(result.stats.total).toBe(7);
    expect(result.stats.byType.table).toBe(3);
    expect(result.stats.byType.figure).toBe(2);
    expect(result.stats.byType.footnote).toBe(2);
    expect(result.stats.avgConfidence).toBeCloseTo(0.827, 2);
    expect(result.stats.minConfidence).toBe(0.6);
    expect(result.stats.maxConfidence).toBe(0.99);
  });
});

describe('calculateStats', () => {
  it('calculates stats for entities', () => {
    const stats = calculateStats(mockEntities);
    expect(stats.total).toBe(7);
    expect(stats.byType.table).toBe(3);
    expect(stats.byPage[1]).toBe(3);
    expect(stats.byPage[2]).toBe(1);
  });

  it('handles empty array', () => {
    const stats = calculateStats([]);
    expect(stats.total).toBe(0);
    expect(stats.avgConfidence).toBe(0);
    expect(stats.minConfidence).toBe(0);
    expect(stats.maxConfidence).toBe(0);
  });

  it('handles entities without confidence', () => {
    const entities: Entity[] = [
      { id: '1', type: 'table', title: 'A', page: 1 },
      { id: '2', type: 'table', title: 'B', page: 2 },
    ];
    const stats = calculateStats(entities);
    expect(stats.total).toBe(2);
    expect(stats.avgConfidence).toBe(0);
  });
});

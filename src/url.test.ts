import { describe, expect, it } from 'vitest';
import { doc } from './url.js';

describe('doc URL builder', () => {
  describe('pg_N flat URLs', () => {
    it('pg[N].png returns flat page image URL', () => {
      const d = doc('ocr-abc');
      expect(d.pg[1].png()).toBe(
        'https://api.okrapdf.com/v1/documents/ocr-abc/pg_1.png',
      );
    });

    it('pg[N].md returns flat page markdown URL', () => {
      const d = doc('ocr-abc');
      expect(d.pg[1].md()).toBe(
        'https://api.okrapdf.com/v1/documents/ocr-abc/pg_1.md',
      );
    });

    it('pg[N].json returns flat page blocks URL', () => {
      const d = doc('ocr-abc');
      expect(d.pg[1].json()).toBe(
        'https://api.okrapdf.com/v1/documents/ocr-abc/pg_1.json',
      );
    });

    it('pg[N] with provider includes t_ segment', () => {
      const d = doc('ocr-abc', { provider: 'llamaparse' });
      expect(d.pg[1].md()).toBe(
        'https://api.okrapdf.com/v1/documents/ocr-abc/t_llamaparse/pg_1.md',
      );
    });

    it('pg[N].png with provider includes t_ segment', () => {
      const d = doc('ocr-abc', { provider: 'llamaparse' });
      expect(d.pg[2].png()).toBe(
        'https://api.okrapdf.com/v1/documents/ocr-abc/t_llamaparse/pg_2.png',
      );
    });

    it('works with fileName + provider', () => {
      const d = doc('ocr-abc', { fileName: 'report.pdf', provider: 'docling' });
      expect(d.pg[1].md()).toBe(
        'https://api.okrapdf.com/v1/documents/ocr-abc/t_docling/pg_1.md',
      );
    });
  });

  describe('thumbnail', () => {
    it('uses pg_1 flat URL', () => {
      const d = doc('ocr-abc');
      expect(d.thumbnail.url()).toBe(
        'https://api.okrapdf.com/v1/documents/ocr-abc/pg_1.png',
      );
    });

    it('respects provider transformation', () => {
      const d = doc('ocr-abc', { provider: 'llamaparse' });
      expect(d.thumbnail.url()).toBe(
        'https://api.okrapdf.com/v1/documents/ocr-abc/t_llamaparse/pg_1.png',
      );
    });
  });

  describe('full document markdown', () => {
    it('d.full.md() returns full.md URL', () => {
      const d = doc('doc-abc');
      expect(d.full.md()).toBe(
        'https://api.okrapdf.com/v1/documents/doc-abc/full.md',
      );
    });

    it('works with custom base URL', () => {
      const d = doc('doc-abc', 'https://worker.example.com');
      expect(d.full.md()).toBe(
        'https://worker.example.com/v1/documents/doc-abc/full.md',
      );
    });
  });

  describe('download', () => {
    it('d.download() returns download URL', () => {
      const d = doc('doc-abc');
      expect(d.download()).toBe(
        'https://api.okrapdf.com/document/doc-abc/download',
      );
    });

    it('works with custom base URL', () => {
      const d = doc('doc-abc', 'https://worker.example.com');
      expect(d.download()).toBe(
        'https://worker.example.com/document/doc-abc/download',
      );
    });
  });

  describe('page ranges', () => {
    it('pg.range(1, 5).md() returns range URL', () => {
      const d = doc('doc-abc');
      expect(d.pg.range(1, 5).md()).toBe(
        'https://api.okrapdf.com/v1/documents/doc-abc/pg_1-5.md',
      );
    });

    it('pg.range(1, 5).json() returns range URL', () => {
      const d = doc('doc-abc');
      expect(d.pg.range(1, 5).json()).toBe(
        'https://api.okrapdf.com/v1/documents/doc-abc/pg_1-5.json',
      );
    });

    it('pg.list(1, 3, 5).md() returns list URL', () => {
      const d = doc('doc-abc');
      expect(d.pg.list(1, 3, 5).md()).toBe(
        'https://api.okrapdf.com/v1/documents/doc-abc/pg_1,3,5.md',
      );
    });

    it('pg.list(1, 3, 5).json() returns list URL', () => {
      const d = doc('doc-abc');
      expect(d.pg.list(1, 3, 5).json()).toBe(
        'https://api.okrapdf.com/v1/documents/doc-abc/pg_1,3,5.json',
      );
    });

    it('range with provider includes t_ segment', () => {
      const d = doc('doc-abc', { provider: 'llamaparse' });
      expect(d.pg.range(2, 4).md()).toBe(
        'https://api.okrapdf.com/v1/documents/doc-abc/t_llamaparse/pg_2-4.md',
      );
    });
  });

  describe('placeholder', () => {
    it('per-page placeholder inserts d_ segment', () => {
      const d = doc('doc-abc');
      expect(d.pg[2].png({ placeholder: 'shimmer' })).toBe(
        'https://api.okrapdf.com/v1/documents/doc-abc/d_shimmer/pg_2.png',
      );
    });

    it('per-page placeholder auto', () => {
      const d = doc('doc-abc');
      expect(d.pg[2].png({ placeholder: 'auto' })).toBe(
        'https://api.okrapdf.com/v1/documents/doc-abc/d_auto/pg_2.png',
      );
    });

    it('builder-level placeholder applies to all png URLs', () => {
      const d = doc('doc-abc', { placeholder: 'shimmer' });
      expect(d.pg[2].png()).toBe(
        'https://api.okrapdf.com/v1/documents/doc-abc/d_shimmer/pg_2.png',
      );
    });

    it('page-level placeholder overrides builder-level', () => {
      const d = doc('doc-abc', { placeholder: 'shimmer' });
      expect(d.pg[2].png({ placeholder: 'auto' })).toBe(
        'https://api.okrapdf.com/v1/documents/doc-abc/d_auto/pg_2.png',
      );
    });

    it('builder-level placeholder applies to thumbnail', () => {
      const d = doc('doc-abc', { placeholder: 'shimmer' });
      expect(d.thumbnail.url()).toBe(
        'https://api.okrapdf.com/v1/documents/doc-abc/d_shimmer/pg_1.png',
      );
    });

    it('placeholder + provider together', () => {
      const d = doc('doc-abc', { provider: 'llamaparse', placeholder: 'shimmer' });
      expect(d.pg[1].png()).toBe(
        'https://api.okrapdf.com/v1/documents/doc-abc/t_llamaparse/d_shimmer/pg_1.png',
      );
    });

    it('md URLs do not get placeholder from builder-level', () => {
      const d = doc('doc-abc', { placeholder: 'shimmer' });
      // md URLs still get the d_ segment since defaultImage applies to all pg routes
      expect(d.pg[1].md()).toBe(
        'https://api.okrapdf.com/v1/documents/doc-abc/d_shimmer/pg_1.md',
      );
    });
  });

  describe('document root URL', () => {
    it('uses "document" artifact when fileName is not provided', () => {
      const d = doc('ocr-abc');
      expect(d.url()).toBe(
        'https://api.okrapdf.com/v1/documents/ocr-abc/document.json',
      );
    });

    it('uses slugified fileName as artifact', () => {
      const d = doc('ocr-abc123', { fileName: 'Quarterly Report 2025.pdf' });
      expect(d.url()).toBe(
        'https://api.okrapdf.com/v1/documents/ocr-abc123/quarterly-report-2025.json',
      );
    });

    it('supports explicit baseUrl + fileName options', () => {
      const d = doc('ocr-custom', 'https://worker.example.com', { fileName: 'invoice.pdf' });
      expect(d.url()).toBe('https://worker.example.com/v1/documents/ocr-custom/invoice.json');
    });
  });

  describe('entities', () => {
    it('tables collection URL with format', () => {
      const d = doc('ocr-abc123', { fileName: 'Quarterly Report 2025.pdf' });
      expect(d.entities.tables[0].url({ format: 'html' })).toBe(
        'https://api.okrapdf.com/v1/documents/ocr-abc123/entities/tables/0/quarterly-report-2025.html?format=html',
      );
    });

    it('inserts /t_{provider} for entities', () => {
      const d = doc('ocr-abc', { provider: 'googleocr' });
      expect(d.entities.tables.url({ format: 'csv' })).toBe(
        'https://api.okrapdf.com/v1/documents/ocr-abc/t_googleocr/entities/tables/document.csv?format=csv',
      );
    });
  });

  describe('provider transformations', () => {
    it('per-call provider overrides default', () => {
      const d = doc('ocr-abc', { provider: 'googleocr' });
      expect(d.url({ provider: 'unstructured', format: 'html' })).toBe(
        'https://api.okrapdf.com/v1/documents/ocr-abc/t_unstructured/document.html?format=html',
      );
    });

    it('no provider = no transformation segment', () => {
      const d = doc('ocr-abc');
      expect(d.pg[0].json()).toBe(
        'https://api.okrapdf.com/v1/documents/ocr-abc/pg_0.json',
      );
    });
  });

  describe('delivery transforms', () => {
    it('single transform: { w: 200 }', () => {
      const d = doc('doc-abc');
      expect(d.pg[1].png({ transform: { w: 200 } })).toBe(
        'https://api.okrapdf.com/v1/documents/doc-abc/w_200/pg_1.png',
      );
    });

    it('multiple transforms follow DELIVERY_KEY_ORDER', () => {
      const d = doc('doc-abc');
      expect(d.pg[1].png({ transform: { w: 200, h: 300, q: 80, bl: 20 } })).toBe(
        'https://api.okrapdf.com/v1/documents/doc-abc/w_200,h_300,q_80,bl_20/pg_1.png',
      );
    });

    it('combined: provider + placeholder + transform', () => {
      const d = doc('doc-abc', { provider: 'llamaparse', placeholder: 'shimmer' });
      expect(d.pg[1].png({ transform: { w: 200, h: 300 } })).toBe(
        'https://api.okrapdf.com/v1/documents/doc-abc/t_llamaparse/d_shimmer/w_200,h_300/pg_1.png',
      );
    });

    it('per-call placeholder override + transform', () => {
      const d = doc('doc-abc', { placeholder: 'shimmer' });
      expect(d.pg[2].png({ placeholder: 'auto', transform: { w: 100 } })).toBe(
        'https://api.okrapdf.com/v1/documents/doc-abc/d_auto/w_100/pg_2.png',
      );
    });

    it('thumbnail with transform', () => {
      const d = doc('doc-abc', { provider: 'llamaparse', placeholder: 'shimmer' });
      expect(d.thumbnail.url({ transform: { w: 100, h: 100, c: 'cover' } })).toBe(
        'https://api.okrapdf.com/v1/documents/doc-abc/t_llamaparse/d_shimmer/w_100,h_100,c_cover/pg_1.png',
      );
    });

    it('range with transform', () => {
      const d = doc('doc-abc', { provider: 'llamaparse' });
      expect(d.pg.range(1, 5).json({ transform: { q: 90 } })).toBe(
        'https://api.okrapdf.com/v1/documents/doc-abc/t_llamaparse/q_90/pg_1-5.json',
      );
    });

    it('invalid transform throws at build time', () => {
      const d = doc('doc-abc');
      expect(() => d.pg[1].png({ transform: { w: -1 } })).toThrow('Invalid delivery transform');
      expect(() => d.pg[1].png({ transform: { q: 200 } })).toThrow('Invalid delivery transform');
      expect(() => d.pg[1].png({ transform: { bl: 0 } })).toThrow('Invalid delivery transform');
    });

    it('empty transform = no segment added', () => {
      const d = doc('doc-abc');
      expect(d.pg[1].png({ transform: {} })).toBe(
        'https://api.okrapdf.com/v1/documents/doc-abc/pg_1.png',
      );
    });

    it('format enum values in transform', () => {
      const d = doc('doc-abc');
      expect(d.pg[1].png({ transform: { w: 200, f: 'avif', q: 80, bl: 20 } })).toBe(
        'https://api.okrapdf.com/v1/documents/doc-abc/w_200,q_80,f_avif,bl_20/pg_1.png',
      );
    });

    it('transform on document root URL', () => {
      const d = doc('doc-abc');
      expect(d.url({ transform: { w: 200 } })).toBe(
        'https://api.okrapdf.com/v1/documents/doc-abc/w_200/document.json',
      );
    });
  });

  describe('output schema', () => {
    it('d.output("invoice").url() → /o_invoice/document.json', () => {
      const d = doc('doc-abc', { provider: 'llamaparse' });
      expect(d.output('invoice').url()).toBe(
        'https://api.okrapdf.com/v1/documents/doc-abc/t_llamaparse/o_invoice/document.json',
      );
    });

    it('d.output("invoice").pg[1].json() → /o_invoice/pg_1.json', () => {
      const d = doc('doc-abc', { provider: 'llamaparse' });
      expect(d.output('invoice').pg[1].json()).toBe(
        'https://api.okrapdf.com/v1/documents/doc-abc/t_llamaparse/o_invoice/pg_1.json',
      );
    });

    it('d.output("invoice").entities.tables.url()', () => {
      const d = doc('doc-abc', { provider: 'llamaparse' });
      expect(d.output('invoice').entities.tables.url()).toBe(
        'https://api.okrapdf.com/v1/documents/doc-abc/t_llamaparse/o_invoice/entities/tables/document.json',
      );
    });

    it('output at builder level via options', () => {
      const d = doc('doc-abc', { provider: 'llamaparse', output: 'receipt' });
      expect(d.pg[1].json()).toBe(
        'https://api.okrapdf.com/v1/documents/doc-abc/t_llamaparse/o_receipt/pg_1.json',
      );
    });

    it('output + placeholder + transform combined', () => {
      const d = doc('doc-abc', { provider: 'llamaparse', placeholder: 'shimmer' });
      expect(d.output('invoice').pg[1].png({ transform: { w: 200 } })).toBe(
        'https://api.okrapdf.com/v1/documents/doc-abc/t_llamaparse/d_shimmer/o_invoice/w_200/pg_1.png',
      );
    });

    it('output does not leak into original builder', () => {
      const d = doc('doc-abc');
      d.output('invoice'); // create scoped builder but don't use it
      expect(d.pg[1].json()).toBe(
        'https://api.okrapdf.com/v1/documents/doc-abc/pg_1.json',
      );
    });
  });
});

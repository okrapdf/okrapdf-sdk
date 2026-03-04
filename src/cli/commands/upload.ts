/**
 * okra upload — Upload a PDF and optionally wait for processing.
 *
 * Usage:
 *   okra upload invoice.pdf                        # local file
 *   okra upload https://sec.gov/filing.pdf         # URL
 *   okra upload invoice.pdf --no-wait              # fire-and-forget
 *   okra upload invoice.pdf --json                 # {"id":"doc-xxx","phase":"complete","pages":42}
 */

import type { OkraClient } from '../../client';
import type { GlobalFlags } from '../output';
import { progress } from '../output';

export interface UploadOpts extends GlobalFlags {
  noWait?: boolean;
}

export interface UploadResult {
  id: string;
  phase: string;
  pages?: number;
  urls?: {
    full_md: string;
    page_png: string;
    page_md: string;
    completion: string;
    original: string;
  };
}

export async function upload(
  client: OkraClient,
  source: string,
  opts: UploadOpts,
): Promise<UploadResult> {
  progress(`Uploading ${source}…`, opts.quiet);

  const session = await client.upload(source);
  const docId = session.id;

  progress(`Document ID: ${docId}`, opts.quiet);

  if (opts.noWait) {
    return { id: docId, phase: 'uploading' };
  }

  progress('Waiting for processing…', opts.quiet);

  const status = await client.wait(docId, {
    pollIntervalMs: 2_000,
  });

  const base = `https://api.okrapdf.com/v1/documents/${docId}`;
  const urls = {
    full_md: `${base}/full.md`,
    page_png: `${base}/d_shimmer/pg_{N}.png`,
    page_md: `${base}/pg_{N}.md`,
    completion: `https://api.okrapdf.com/document/${docId}/completion`,
    original: `${base}/original.pdf`,
  };

  return {
    id: docId,
    phase: status.phase,
    pages: status.pagesTotal,
    urls,
  };
}

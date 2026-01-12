/**
 * Google Document AI Provider
 *
 * Extracts text, tables, and bounding boxes using Google Cloud Document AI.
 * Uses REST API directly to avoid heavy SDK dependencies.
 *
 * IMPORTANT: Everyone needs their own GCP project + processor.
 * Even pretrained models require creating a processor instance in your project.
 *
 * Setup:
 * 1. Enable Document AI API in GCP Console
 * 2. Create a processor:
 *    - Go to Document AI → Processors → Create
 *    - Choose "Document OCR" (pretrained) for general use
 *    - Or "Form Parser" for forms with checkboxes
 * 3. Note the processor ID from the processor details page
 * 4. Create service account or use application default credentials
 *
 * Recommended Processors (pretrained, no training needed):
 * - Document OCR (pretrained-ocr-v2.0-2023-06-02) - Best for general documents
 * - Form Parser (pretrained-form-parser-v2.0-2022-11-10) - For forms
 *
 * okrapdf uses:
 * - PROJECT_ID: "941119502584" (bogeybot project)
 * - PROCESSOR_ID: "11243784368b940d" (custom processor)
 * - LOCATION: "us"
 */

import type {
  OcrProvider,
  OcrProviderId,
  OcrProviderRuntime,
  OcrProviderCapabilities,
  OcrProviderConfig,
  OcrPageResult,
  OcrBoundingBox,
  OcrTableData,
  OcrProgress,
  OcrProviderMetadata,
  OcrProviderFactory,
} from './ocr-provider';

// ============================================================================
// Google Doc AI Response Types (simplified)
// ============================================================================

interface GoogleVertex {
  x: number;
  y: number;
}

interface GoogleBoundingPoly {
  vertices?: GoogleVertex[];
  normalizedVertices?: GoogleVertex[];
}

interface GoogleTextAnchor {
  textSegments?: Array<{
    startIndex?: string;
    endIndex?: string;
  }>;
  content?: string;
}

interface GoogleLayout {
  textAnchor?: GoogleTextAnchor;
  confidence?: number;
  boundingPoly?: GoogleBoundingPoly;
  orientation?: string;
}

interface GoogleBlock {
  layout?: GoogleLayout;
  detectedLanguages?: Array<{ languageCode: string }>;
}

interface GoogleParagraph {
  layout?: GoogleLayout;
}

interface GoogleLine {
  layout?: GoogleLayout;
}

interface GoogleToken {
  layout?: GoogleLayout;
  detectedBreak?: { type: string };
}

interface GoogleTable {
  layout?: GoogleLayout;
  headerRows?: GoogleTableRow[];
  bodyRows?: GoogleTableRow[];
}

interface GoogleTableRow {
  cells?: GoogleTableCell[];
}

interface GoogleTableCell {
  layout?: GoogleLayout;
  rowSpan?: number;
  colSpan?: number;
}

interface GooglePage {
  pageNumber?: number;
  dimension?: { width: number; height: number; unit: string };
  layout?: GoogleLayout;
  blocks?: GoogleBlock[];
  paragraphs?: GoogleParagraph[];
  lines?: GoogleLine[];
  tokens?: GoogleToken[];
  tables?: GoogleTable[];
  image?: { content: string; mimeType: string };
}

interface GoogleDocument {
  uri?: string;
  mimeType?: string;
  text?: string;
  pages?: GooglePage[];
  entities?: unknown[];
}

interface GoogleProcessResponse {
  document?: GoogleDocument;
  humanReviewStatus?: unknown;
}

// ============================================================================
// Provider Implementation
// ============================================================================

export class GoogleDocAiProvider implements OcrProvider {
  readonly id: OcrProviderId = 'google-docai';
  readonly name = 'Google Document AI';
  readonly runtime: OcrProviderRuntime = 'api';
  readonly capabilities: OcrProviderCapabilities = {
    supportsText: true,
    supportsTables: true,
    supportsBboxes: true,
    supportsFigures: true,
    supportsHandwriting: true,
    supportsMultiLanguage: true,
    outputFormats: ['markdown', 'json'],
    maxPagesPerRequest: 15, // Google Doc AI limit per request
  };

  private projectId: string = '';
  private processorId: string = '';
  private location: string = 'us'; // or 'eu'
  private accessToken: string = '';
  private progressCallbacks = new Set<(progress: OcrProgress) => void>();

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  isAvailable(): boolean {
    return !!(this.projectId && this.processorId && this.accessToken);
  }

  async initialize(config: OcrProviderConfig): Promise<void> {
    this.projectId = config.projectId ?? '';
    this.processorId = config.processorId ?? '';
    this.accessToken = config.apiKey ?? ''; // Use apiKey field for access token

    if (config.options?.location) {
      this.location = config.options.location as string;
    }

    if (!this.projectId || !this.processorId) {
      throw new Error(
        'GoogleDocAiProvider: projectId and processorId are required'
      );
    }
  }

  async dispose(): Promise<void> {
    this.progressCallbacks.clear();
  }

  async checkHealth(): Promise<{ ok: boolean; error?: string; latencyMs?: number }> {
    const startTime = Date.now();

    try {
      // Simple health check - just verify we can build the endpoint
      if (!this.projectId || !this.processorId) {
        return { ok: false, error: 'Missing projectId or processorId' };
      }

      if (!this.accessToken) {
        return { ok: false, error: 'Missing access token' };
      }

      return { ok: true, latencyMs: Date.now() - startTime };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
        latencyMs: Date.now() - startTime,
      };
    }
  }

  // ---------------------------------------------------------------------------
  // Extraction
  // ---------------------------------------------------------------------------

  async extractPage(
    imageBuffer: Buffer,
    pageNumber: number
  ): Promise<OcrPageResult> {
    const startTime = Date.now();

    const endpoint = this.buildEndpoint();
    const base64Content = imageBuffer.toString('base64');

    const requestBody = {
      rawDocument: {
        content: base64Content,
        mimeType: 'image/png',
      },
    };

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Google Doc AI error: ${response.status} - ${errorText}`);
    }

    const result: GoogleProcessResponse = await response.json();

    if (!result.document) {
      return {
        pageNumber,
        markdown: '',
        bboxes: [],
        durationMs: Date.now() - startTime,
      };
    }

    return this.parseDocumentPage(result.document, pageNumber, startTime);
  }

  async *extractDocument(
    pdfBuffer: Buffer,
    options?: { startPage?: number; endPage?: number }
  ): AsyncGenerator<OcrPageResult> {
    const startTime = Date.now();

    this.emitProgress({
      providerId: this.id,
      currentPage: 0,
      totalPages: 0,
      status: 'initializing',
      message: 'Sending PDF to Google Document AI...',
    });

    const endpoint = this.buildEndpoint();
    const base64Content = pdfBuffer.toString('base64');

    const requestBody = {
      rawDocument: {
        content: base64Content,
        mimeType: 'application/pdf',
      },
    };

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Google Doc AI error: ${response.status} - ${errorText}`);
    }

    const result: GoogleProcessResponse = await response.json();

    if (!result.document?.pages) {
      return;
    }

    const pages = result.document.pages;
    const totalPages = pages.length;
    const documentText = result.document.text ?? '';

    for (let i = 0; i < pages.length; i++) {
      const pageData = pages[i];
      const pageNumber = pageData.pageNumber ?? i + 1;

      // Apply page range filter
      if (options?.startPage && pageNumber < options.startPage) continue;
      if (options?.endPage && pageNumber > options.endPage) continue;

      this.emitProgress({
        providerId: this.id,
        currentPage: pageNumber,
        totalPages,
        status: 'processing',
        message: `Processing page ${pageNumber}/${totalPages}`,
      });

      yield this.parsePageData(pageData, documentText, pageNumber, startTime);
    }

    this.emitProgress({
      providerId: this.id,
      currentPage: totalPages,
      totalPages,
      status: 'complete',
      message: 'Extraction complete',
    });
  }

  // ---------------------------------------------------------------------------
  // Progress
  // ---------------------------------------------------------------------------

  onProgress(callback: (progress: OcrProgress) => void): () => void {
    this.progressCallbacks.add(callback);
    return () => this.progressCallbacks.delete(callback);
  }

  private emitProgress(progress: OcrProgress): void {
    for (const callback of this.progressCallbacks) {
      callback(progress);
    }
  }

  // ---------------------------------------------------------------------------
  // Parsing Helpers
  // ---------------------------------------------------------------------------

  private buildEndpoint(): string {
    return `https://${this.location}-documentai.googleapis.com/v1/projects/${this.projectId}/locations/${this.location}/processors/${this.processorId}:process`;
  }

  private parseDocumentPage(
    doc: GoogleDocument,
    pageNumber: number,
    startTime: number
  ): OcrPageResult {
    const page = doc.pages?.[0];
    const text = doc.text ?? '';

    if (!page) {
      return {
        pageNumber,
        markdown: text,
        bboxes: [],
        durationMs: Date.now() - startTime,
      };
    }

    return this.parsePageData(page, text, pageNumber, startTime);
  }

  private parsePageData(
    page: GooglePage,
    documentText: string,
    pageNumber: number,
    startTime: number
  ): OcrPageResult {
    const bboxes: OcrBoundingBox[] = [];
    const tables: OcrTableData[] = [];

    // Extract blocks as bboxes
    if (page.blocks) {
      for (const block of page.blocks) {
        const bbox = this.layoutToBbox(block.layout, 'paragraph');
        if (bbox) {
          bboxes.push(bbox);
        }
      }
    }

    // Extract paragraphs
    if (page.paragraphs) {
      for (const para of page.paragraphs) {
        const bbox = this.layoutToBbox(para.layout, 'paragraph');
        if (bbox) {
          bboxes.push(bbox);
        }
      }
    }

    // Extract tables
    if (page.tables) {
      for (let i = 0; i < page.tables.length; i++) {
        const table = page.tables[i];
        const tableData = this.parseTable(table, `table-${pageNumber}-${i}`);
        if (tableData) {
          tables.push(tableData);

          // Add table bbox
          const bbox = this.layoutToBbox(table.layout, 'table');
          if (bbox) {
            bbox.id = tableData.id;
            bboxes.push(bbox);
          }
        }
      }
    }

    // Extract text for this page using text anchors
    const pageText = this.extractPageText(page, documentText);

    return {
      pageNumber,
      markdown: pageText,
      bboxes,
      tables: tables.length > 0 ? tables : undefined,
      confidence: page.layout?.confidence,
      durationMs: Date.now() - startTime,
    };
  }

  private layoutToBbox(
    layout: GoogleLayout | undefined,
    type: OcrBoundingBox['type']
  ): OcrBoundingBox | null {
    if (!layout?.boundingPoly) return null;

    const vertices =
      layout.boundingPoly.normalizedVertices ??
      layout.boundingPoly.vertices?.map((v) => ({
        x: v.x / 1000, // Assume 1000-scale if not normalized
        y: v.y / 1000,
      }));

    if (!vertices || vertices.length < 4) return null;

    return {
      type,
      vertices: vertices.map((v) => ({ x: v.x ?? 0, y: v.y ?? 0 })),
      text: layout.textAnchor?.content,
      confidence: layout.confidence,
    };
  }

  private parseTable(table: GoogleTable, id: string): OcrTableData | null {
    if (!table.headerRows && !table.bodyRows) return null;

    const rows: string[][] = [];
    let headers: string[] = [];

    // Parse header rows
    if (table.headerRows) {
      for (const row of table.headerRows) {
        const cells =
          row.cells?.map((cell) => cell.layout?.textAnchor?.content ?? '') ?? [];
        if (headers.length === 0) {
          headers = cells;
        }
        rows.push(cells);
      }
    }

    // Parse body rows
    if (table.bodyRows) {
      for (const row of table.bodyRows) {
        const cells =
          row.cells?.map((cell) => cell.layout?.textAnchor?.content ?? '') ?? [];
        rows.push(cells);
      }
    }

    // Convert to markdown
    const markdown = this.tableToMarkdown(rows, headers);

    return {
      id,
      markdown,
      headers: headers.length > 0 ? headers : undefined,
      rowCount: rows.length,
      colCount: headers.length || rows[0]?.length || 0,
      bbox: table.layout ? this.layoutToBbox(table.layout, 'table') ?? undefined : undefined,
    };
  }

  private tableToMarkdown(rows: string[][], headers: string[]): string {
    if (rows.length === 0) return '';

    const lines: string[] = [];

    // Header row
    const headerRow = headers.length > 0 ? headers : rows[0];
    lines.push('| ' + headerRow.join(' | ') + ' |');
    lines.push('| ' + headerRow.map(() => '---').join(' | ') + ' |');

    // Data rows (skip first if it was used as header)
    const dataRows = headers.length > 0 ? rows.slice(1) : rows.slice(1);
    for (const row of dataRows) {
      lines.push('| ' + row.join(' | ') + ' |');
    }

    return lines.join('\n');
  }

  private extractPageText(page: GooglePage, documentText: string): string {
    // Try to extract text from page layout
    if (page.layout?.textAnchor?.textSegments) {
      const segments = page.layout.textAnchor.textSegments;
      let text = '';

      for (const segment of segments) {
        const start = parseInt(segment.startIndex ?? '0', 10);
        const end = parseInt(segment.endIndex ?? '0', 10);
        text += documentText.slice(start, end);
      }

      return text.trim();
    }

    // Fallback: concatenate paragraph texts
    if (page.paragraphs) {
      return page.paragraphs
        .map((p) => p.layout?.textAnchor?.content ?? '')
        .filter(Boolean)
        .join('\n\n');
    }

    return '';
  }
}

// ============================================================================
// Factory & Metadata
// ============================================================================

export const GoogleDocAiProviderFactory: OcrProviderFactory = (config) => {
  const provider = new GoogleDocAiProvider();
  return provider;
};

export const GoogleDocAiProviderMetadata: Omit<OcrProviderMetadata, 'id'> = {
  name: 'Google Document AI',
  description:
    'Google Cloud Document AI for high-quality OCR with layout analysis and bounding boxes',
  runtime: 'api',
  capabilities: {
    supportsText: true,
    supportsTables: true,
    supportsBboxes: true,
    supportsFigures: true,
    supportsHandwriting: true,
    supportsMultiLanguage: true,
    outputFormats: ['markdown', 'json'],
    maxPagesPerRequest: 15,
  },
  configSchema: {
    type: 'object',
    properties: {
      projectId: {
        type: 'string',
        title: 'GCP Project ID',
        description: 'Your Google Cloud project ID (numeric)',
      },
      processorId: {
        type: 'string',
        title: 'Processor ID',
        description: 'Document AI processor ID (from processor details page)',
      },
      apiKey: {
        type: 'string',
        title: 'Access Token',
        description: 'GCP access token from `gcloud auth print-access-token`',
        format: 'password',
      },
      location: {
        type: 'string',
        title: 'Location',
        description: 'Processor location (must match where processor was created)',
        enum: ['us', 'eu'],
        default: 'us',
      },
    },
    required: ['projectId', 'processorId', 'apiKey'],
  },
  documentationUrl:
    'https://cloud.google.com/document-ai/docs/overview',
  costPerPage: 0.01, // Approximately $0.01 per page for OCR processor
  isCloud: true,
  installInstructions: `
## Setup Google Document AI

1. **Enable API**: Go to [Document AI Console](https://console.cloud.google.com/ai/document-ai) and enable the API

2. **Create Processor**:
   - Click "Create Processor"
   - Select "Document OCR" (recommended) or "Form Parser"
   - Choose location: us or eu
   - Note the Processor ID from the details page

3. **Get Access Token**:
   \`\`\`bash
   gcloud auth application-default login
   gcloud auth print-access-token
   \`\`\`

4. **Configure**:
   - Project ID: Your GCP project number (e.g., "941119502584")
   - Processor ID: From processor details (e.g., "11243784368b940d")
   - Location: "us" or "eu" (must match processor)
`,
};

// ============================================================================
// Preset Configs
// ============================================================================

/**
 * Preset config matching okrapdf cloud deployment.
 * Note: Requires valid access token.
 */
export const OKRAPDF_DOCAI_CONFIG: Partial<OcrProviderConfig> = {
  projectId: '941119502584', // bogeybot GCP project
  processorId: '11243784368b940d', // okrapdf custom processor
  options: { location: 'us' },
};

/**
 * OpenRouter VLM Provider
 *
 * Uses OpenRouter's multi-modal LLMs (Qwen VL, Claude, etc.) for PDF extraction.
 * VLMs extract markdown/text but don't return bounding boxes.
 *
 * Good for:
 * - Table extraction with markdown formatting
 * - Content extraction from complex layouts
 * - When bbox overlays aren't needed
 *
 * Compared to Google Doc AI:
 * - Pros: Better at understanding context, cheaper for large docs
 * - Cons: No bounding boxes, slower, less structured output
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
// Constants
// ============================================================================

const DEFAULT_MODEL = 'qwen/qwen2.5-vl-72b-instruct';

const EXTRACTION_PROMPT = `Analyze this PDF page image. Extract ALL content as clean markdown.

Instructions:
1. Extract all text, preserving structure and hierarchy
2. Convert tables to markdown table format
3. Describe figures/charts briefly in [brackets]
4. Preserve headings with proper markdown levels (#, ##, etc.)
5. Keep lists as markdown lists

Output clean markdown only. Do not include explanations.`;

const TABLE_EXTRACTION_PROMPT = `Analyze this PDF page image. Extract ALL tables you find as markdown.

For each table:
1. Preserve the exact structure (rows/columns)
2. Keep headers if present
3. Maintain data alignment

Return ONLY valid markdown tables, one after another. If no tables found, return "NO_TABLES_FOUND".

Example output format:
| Header 1 | Header 2 |
|----------|----------|
| Data 1   | Data 2   |
`;

// ============================================================================
// Provider Implementation
// ============================================================================

export class OpenRouterProvider implements OcrProvider {
  readonly id: OcrProviderId = 'openrouter';
  readonly name = 'OpenRouter VLM';
  readonly runtime: OcrProviderRuntime = 'api';
  readonly capabilities: OcrProviderCapabilities = {
    supportsText: true,
    supportsTables: true,
    supportsBboxes: false, // VLMs don't return bounding boxes
    supportsFigures: false, // Can describe but not extract
    supportsHandwriting: true, // VLMs handle handwriting well
    supportsMultiLanguage: true,
    outputFormats: ['markdown'],
    maxPagesPerRequest: 1, // Process one page at a time
  };

  private apiKey: string = '';
  private model: string = DEFAULT_MODEL;
  private mode: 'full' | 'tables' = 'full';
  private progressCallbacks = new Set<(progress: OcrProgress) => void>();

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  isAvailable(): boolean {
    return !!this.apiKey;
  }

  async initialize(config: OcrProviderConfig): Promise<void> {
    this.apiKey = config.apiKey ?? '';
    this.model = config.modelId ?? DEFAULT_MODEL;

    if (config.options?.mode) {
      this.mode = config.options.mode as 'full' | 'tables';
    }

    if (!this.apiKey) {
      throw new Error('OpenRouterProvider: apiKey is required');
    }
  }

  async dispose(): Promise<void> {
    this.progressCallbacks.clear();
  }

  async checkHealth(): Promise<{ ok: boolean; error?: string; latencyMs?: number }> {
    const startTime = Date.now();

    try {
      // Simple validation request
      const response = await fetch('https://openrouter.ai/api/v1/models', {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
        },
      });

      if (!response.ok) {
        return {
          ok: false,
          error: `API returned ${response.status}`,
          latencyMs: Date.now() - startTime,
        };
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
    const imageBase64 = imageBuffer.toString('base64');
    const prompt = this.mode === 'tables' ? TABLE_EXTRACTION_PROMPT : EXTRACTION_PROMPT;

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://github.com/okrapdf/okrapdf-desktop',
        'X-Title': 'OkraPDF Desktop',
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              {
                type: 'image_url',
                image_url: { url: `data:image/png;base64,${imageBase64}` },
              },
            ],
          },
        ],
        max_tokens: 4096,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenRouter API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const markdown = data.choices?.[0]?.message?.content || '';

    // Parse tables from markdown if in table mode
    const tables =
      this.mode === 'tables' ? this.parseMarkdownTables(markdown, pageNumber) : undefined;

    return {
      pageNumber,
      markdown: markdown.includes('NO_TABLES_FOUND') ? '' : markdown,
      bboxes: [], // OpenRouter VLM doesn't return bboxes
      tables,
      durationMs: Date.now() - startTime,
    };
  }

  async *extractDocument(
    pdfBuffer: Buffer,
    options?: { startPage?: number; endPage?: number }
  ): AsyncGenerator<OcrPageResult> {
    // Note: This provider requires the caller to handle PDF → image conversion
    // because we're in an SDK context without Node.js PDF rendering deps.
    //
    // For okrapdf-desktop, the main process should:
    // 1. Render PDF pages to images using pdfjs-dist + @napi-rs/canvas
    // 2. Call extractPage for each image
    //
    // This generator exists for interface compliance but throws if called directly.
    throw new Error(
      'OpenRouterProvider.extractDocument requires pre-rendered images. ' +
        'Use extractPage with individual page images instead.'
    );

    // TypeScript requires yield for generators
    yield* [];
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
  // Helpers
  // ---------------------------------------------------------------------------

  private parseMarkdownTables(markdown: string, pageNum: number): OcrTableData[] {
    if (markdown.includes('NO_TABLES_FOUND')) {
      return [];
    }

    // Match markdown table patterns
    const tableRegex = /\|[^\n]+\|[\s\S]*?(?=\n\n|\n(?!\|)|$)/g;
    const matches = markdown.match(tableRegex) || [];

    return matches.map((tableMarkdown, idx) => {
      // Count rows and columns
      const rows = tableMarkdown.trim().split('\n');
      const headerCells = rows[0]?.split('|').filter(Boolean) || [];

      return {
        id: `table-p${pageNum}-${idx + 1}`,
        markdown: tableMarkdown.trim(),
        headers: headerCells.map((h) => h.trim()),
        rowCount: rows.length - 1, // Exclude separator row
        colCount: headerCells.length,
      };
    });
  }
}

// ============================================================================
// Factory & Metadata
// ============================================================================

export const OpenRouterProviderFactory: OcrProviderFactory = (config) => {
  const provider = new OpenRouterProvider();
  return provider;
};

export const OpenRouterProviderMetadata: Omit<OcrProviderMetadata, 'id'> = {
  name: 'OpenRouter VLM',
  description:
    'Multi-modal LLMs via OpenRouter (Qwen VL, Claude, etc.) for markdown extraction',
  runtime: 'api',
  capabilities: {
    supportsText: true,
    supportsTables: true,
    supportsBboxes: false,
    supportsFigures: false,
    supportsHandwriting: true,
    supportsMultiLanguage: true,
    outputFormats: ['markdown'],
    maxPagesPerRequest: 1,
  },
  configSchema: {
    type: 'object',
    properties: {
      apiKey: {
        type: 'string',
        title: 'OpenRouter API Key',
        description: 'Get from https://openrouter.ai/keys',
        format: 'password',
      },
      modelId: {
        type: 'string',
        title: 'Model',
        description: 'VLM model to use',
        enum: [
          'qwen/qwen2.5-vl-72b-instruct',
          'anthropic/claude-3.5-sonnet',
          'google/gemini-pro-vision',
          'openai/gpt-4-vision-preview',
        ],
        default: 'qwen/qwen2.5-vl-72b-instruct',
      },
      mode: {
        type: 'string',
        title: 'Extraction Mode',
        description: 'What to extract',
        enum: ['full', 'tables'],
        default: 'full',
      },
    },
    required: ['apiKey'],
  },
  documentationUrl: 'https://openrouter.ai/docs',
  costPerPage: 0.005, // Varies by model, this is approximate for Qwen VL
  isCloud: true,
  installInstructions: `
## Setup OpenRouter

1. **Get API Key**: Sign up at [openrouter.ai](https://openrouter.ai) and get an API key

2. **Add Credits**: Add credits to your account (pay-as-you-go)

3. **Configure**:
   - API Key: Your OpenRouter API key
   - Model: Recommended "qwen/qwen2.5-vl-72b-instruct" for best value
   - Mode: "full" for all content, "tables" for table extraction only

## Model Recommendations

| Model | Cost | Speed | Quality |
|-------|------|-------|---------|
| Qwen VL 72B | $ | Fast | Good |
| Claude 3.5 Sonnet | $$ | Medium | Excellent |
| GPT-4 Vision | $$$ | Slow | Excellent |

Qwen VL 72B offers the best balance of cost, speed, and quality for document extraction.
`,
};

// ============================================================================
// Available Models
// ============================================================================

export const OPENROUTER_VLM_MODELS = [
  {
    id: 'qwen/qwen2.5-vl-72b-instruct',
    name: 'Qwen 2.5 VL 72B',
    description: 'Best value for document extraction',
    costPer1kTokens: 0.0004,
  },
  {
    id: 'anthropic/claude-3.5-sonnet',
    name: 'Claude 3.5 Sonnet',
    description: 'Excellent accuracy, higher cost',
    costPer1kTokens: 0.003,
  },
  {
    id: 'google/gemini-pro-vision',
    name: 'Gemini Pro Vision',
    description: 'Good balance of cost and quality',
    costPer1kTokens: 0.00025,
  },
  {
    id: 'openai/gpt-4-vision-preview',
    name: 'GPT-4 Vision',
    description: 'High accuracy, highest cost',
    costPer1kTokens: 0.01,
  },
] as const;

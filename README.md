# okrapdf

Upload a PDF, get an OpenAI-compatible endpoint.

```
npm install okrapdf
```

Get your API key at [okrapdf.com/dashboard](https://okrapdf.com/dashboard).

## Quick Start

```ts
import { OkraClient } from 'okrapdf';

const okra = new OkraClient({ apiKey: process.env.OKRA_API_KEY });
const session = await okra.sessions.create('./invoice.pdf');

// Every document gets its own chat/completions URL
console.log(session.modelEndpoint);
```

That prints a URL like:

```
https://api.okrapdf.com/v1/documents/doc-441a8a0be0e94914b982
```

This is a full OpenAI-compatible base URL. Plug it into any client.

## What You Get

Upload a PDF and OkraPDF gives you predictable URLs for everything:

```
Document:   doc-441a8a0be0e94914b982

Completion: https://api.okrapdf.com/document/doc-441a8a0be0e94914b982/chat/completions
Status:     https://api.okrapdf.com/document/doc-441a8a0be0e94914b982/status
Pages:      https://api.okrapdf.com/document/doc-441a8a0be0e94914b982/pages
Entities:   https://api.okrapdf.com/document/doc-441a8a0be0e94914b982/nodes
Download:   https://api.okrapdf.com/document/doc-441a8a0be0e94914b982/download

Page images:
  pg 1:     https://api.okrapdf.com/v1/documents/doc-441a8a0be0e94914b982/pg_1.png
  resized:  https://api.okrapdf.com/v1/documents/doc-441a8a0be0e94914b982/w_200,h_300/pg_1.png
  shimmer:  https://api.okrapdf.com/v1/documents/doc-441a8a0be0e94914b982/d_shimmer/pg_1.png
```

All URLs are deterministic. Build them from the document ID without calling the API first.

## Use with OpenAI SDK

```ts
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OKRA_API_KEY,
  baseURL: session.modelEndpoint,  // https://api.okrapdf.com/v1/documents/doc-...
});

const res = await openai.chat.completions.create({
  model: 'okra',
  messages: [{ role: 'user', content: 'What form is this?' }],
});

console.log(res.choices[0].message.content);
// → "This is Form W-9 (Request for Taxpayer Identification Number and
//    Certification), used by entities to collect a taxpayer's TIN..."
```

## Use with AI SDK

```ts
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { generateText } from 'ai';

const provider = createOpenAICompatible({
  name: 'okra',
  apiKey: process.env.OKRA_API_KEY,
  baseURL: session.modelEndpoint,
});

const { text } = await generateText({
  model: provider('okra'),
  prompt: 'Summarize this document in 3 bullet points',
});
```

## Use with curl

```bash
# Upload
curl -X POST https://api.okrapdf.com/document/doc-my-w9/upload-url \
  -H "Authorization: Bearer $OKRA_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://www.irs.gov/pub/irs-pdf/fw9.pdf"}'

# Ask a question
curl https://api.okrapdf.com/document/doc-my-w9/chat/completions \
  -H "Authorization: Bearer $OKRA_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"messages": [{"role": "user", "content": "List all parts of this form."}]}'
```

Response:

```json
{
  "id": "chatcmpl-18g5qhmmrm",
  "object": "chat.completion",
  "model": "accounts/fireworks/models/kimi-k2p5",
  "choices": [{
    "message": {
      "role": "assistant",
      "content": "Based on the Form W-9 document, there are two numbered parts:\n\n| Part | Title |\n|------|-------|\n| Part I | Taxpayer Identification Number (TIN) |\n| Part II | Certification |"
    },
    "finish_reason": "stop"
  }],
  "usage": { "prompt_tokens": 227, "completion_tokens": 404, "total_tokens": 631 }
}
```

## SDK Methods

The SDK wraps all of this so you don't need a separate client:

```ts
// Ask a question (non-streaming)
const { answer } = await session.prompt('What is the total amount due?');

// Stream
for await (const event of session.stream('Summarize this document')) {
  if (event.type === 'text_delta') process.stdout.write(event.text);
}

// Structured output with Zod
import { z } from 'zod';

const Invoice = z.object({
  vendor: z.string(),
  total: z.number(),
  lineItems: z.array(z.object({
    description: z.string(),
    amount: z.number(),
  })),
});

const { data } = await session.prompt('Extract the invoice', { schema: Invoice });
// data: { vendor: "Acme Corp", total: 1250.00, lineItems: [...] }
```

## Pages & Entities

```ts
const pages = await session.pages();           // { pageCount: 6, pages: [...] }
const { nodes } = await session.entities();    // extracted text, tables, etc.
const { nodes } = await session.entities({ type: 'table' });
```

## Upload

Accepts file paths, URLs, `Blob`, `ArrayBuffer`, or `Uint8Array`:

```ts
// URL
const session = await okra.sessions.create('https://example.com/report.pdf');

// Bytes
const session = await okra.sessions.create(pdfBytes, {
  upload: { fileName: 'report.pdf' },
});

// Attach to existing document (no upload, no wait)
const session = okra.sessions.from('doc-441a8a0be0e94914b982');
```

## Deterministic URLs

Build page image and export URLs from a document ID — no API call needed:

```ts
import { doc } from 'okrapdf/doc';

const d = doc('doc-441a8a0be0e94914b982');

d.pages(1).image();                    // .../pg_1.png
d.pages(1).image({ w: 200, h: 300 }); // .../w_200,h_300/pg_1.png
d.export('markdown');                  // .../export.md
```

## Collections — Fan-Out Query to CSV

Ask the same question across every document in a collection. Each doc answers independently in parallel, results stream back as NDJSON.

```ts
import { OkraClient } from 'okrapdf';
import { z } from 'zod';
import { writeFileSync } from 'fs';

const okra = new OkraClient({ apiKey: process.env.OKRA_API_KEY });

// Fan-out: ask every doc in the collection the same question
const stream = okra.collections.query(
  'col-40da068481cf4f248853507cba6be611',
  'Who are the top 3 people mentioned in this document?',
);

// Gather all results
const result = await stream.gather();

// Write CSV
const header = 'doc_id,doc_name,answer,cost_usd';
const rows = [...result.answers.values()].map(a =>
  `"${a.docId}","${a.answer.slice(0, 200)}",${a.costUsd}`
);
writeFileSync('results.csv', [header, ...rows].join('\n'));

console.log(`${result.completed} docs, $${result.totalCostUsd.toFixed(4)} total`);
```

Real output from a 10-K earnings collection:

```csv
doc_id,file_name,answer,cost_usd
"doc-9a3f21...","NVDA-10K-2025.pdf","Revenue: $130.5B, Net Income: $72.9B, YoY Growth: 114%",0.0048
"doc-b7e810...","AAPL-10K-2025.pdf","Revenue: $391.0B, Net Income: $101.2B, YoY Growth: 5%",0.0039
"doc-c4d562...","MSFT-10K-2025.pdf","Revenue: $254.2B, Net Income: $97.1B, YoY Growth: 16%",0.0051
```

Works with structured output too — pass a Zod schema and each doc extracts typed data:

```ts
const FinancialReport = z.object({
  company: z.string(),
  revenue: z.number(),
  netIncome: z.number(),
  quarter: z.string(),
});

const stream = okra.collections.query(
  'col-financials',
  'Extract the financial summary',
  { schema: FinancialReport },
);

const result = await stream.gather();
for (const [docId, answer] of result.answers) {
  console.log(answer.data); // { company: "NVIDIA", revenue: 35082, ... }
}
```

Or stream per-doc events in real time:

```ts
for await (const event of stream) {
  if (event.type === 'result') {
    console.log(`${event.doc_id}: ${event.answer.slice(0, 80)}...`);
  }
}
```

## Sub-path Exports

| Import | Use |
|--------|-----|
| `okrapdf` | `OkraClient`, types, errors |
| `okrapdf/doc` | `doc()` URL builder |
| `okrapdf/browser` | Browser-safe client (no Node.js deps) |
| `okrapdf/worker` | Cloudflare Worker adapter |
| `okrapdf/react` | React hooks (`useSession`, `usePages`) |

## CLI

```bash
npx okrapdf upload ./invoice.pdf
npx okrapdf pages doc-abc123
npx okrapdf chat doc-abc123 "What is the total?"
```

## License

MIT

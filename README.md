# okrapdf

Upload a PDF, get an API. TypeScript SDK for [OkraPDF](https://okrapdf.com).

```
npm install okrapdf
```

## Quick Start

```ts
import { OkraClient } from 'okrapdf';

const client = new OkraClient({ apiKey: process.env.OKRA_API_KEY });

// Upload and wait for extraction
const session = await client.sessions.create('./invoice.pdf');

// Ask questions
const { answer } = await session.prompt('What is the total amount due?');
console.log(answer);
```

## Features

**Upload** — local files, URLs, `Blob`, `ArrayBuffer`, or `Uint8Array`

```ts
// URL
const session = await client.sessions.create('https://example.com/report.pdf');

// Binary
const session = await client.sessions.create(pdfBytes, {
  upload: { fileName: 'report.pdf' },
});
```

**Pages & Entities** — structured extraction results

```ts
const pages = await session.pages();
const { nodes } = await session.entities({ type: 'table' });
```

**Streaming Chat** — OpenAI-compatible SSE

```ts
for await (const event of session.stream('Summarize this document')) {
  if (event.type === 'text_delta') process.stdout.write(event.text);
}
```

**Structured Output** — Zod or JSON Schema

```ts
import { z } from 'zod';

const Invoice = z.object({
  vendor: z.string(),
  total: z.number(),
  lineItems: z.array(z.object({ description: z.string(), amount: z.number() })),
});

const { data } = await session.prompt('Extract the invoice data', {
  schema: Invoice,
});
// data is typed as z.infer<typeof Invoice>
```

**Collections** — fan-out queries across multiple documents

```ts
const collections = await client.collections.list();
const collection = await client.collections.get('col-abc123');
```

**Deterministic URLs** — Cloudinary-style predictable media URLs

```ts
import { doc } from 'okrapdf/doc';

const d = doc('doc-abc123');
d.pages(1).image();       // https://res.okrapdf.com/v1/documents/doc-abc123/pg_1.png
d.pages(1).image({ w: 200, h: 300 }); // .../w_200,h_300/pg_1.png
d.export('markdown');      // .../export.md
```

## Sub-path Exports

| Import | Use |
|--------|-----|
| `okrapdf` | `OkraClient`, types, errors |
| `okrapdf/doc` | `doc()` URL builder |
| `okrapdf/browser` | Browser-safe client (no Node.js deps) |
| `okrapdf/worker` | Cloudflare Worker adapter |
| `okrapdf/react` | React hooks (`useSession`, `usePages`) |
| `okrapdf/cli` | CLI internals |

## CLI

```bash
npx okrapdf upload ./invoice.pdf
npx okrapdf pages doc-abc123
npx okrapdf chat doc-abc123 "What is the total?"
```

See `npx okrapdf --help` for all commands.

## License

MIT

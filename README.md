# okrapdf

Upload a PDF, get an OpenAI-compatible endpoint.

```
npm install okrapdf
```

Get your API key at [okrapdf.com/dashboard](https://okrapdf.com/dashboard).

## Quick Start

Every document gets its own `/chat/completions` URL. Use it with the OpenAI SDK, Vercel AI SDK, LangChain, or plain `fetch`.

```ts
import { OkraClient } from 'okrapdf';

const okra = new OkraClient({ apiKey: process.env.OKRA_API_KEY });
const session = await okra.sessions.create('./invoice.pdf');

console.log(session.modelEndpoint);
// → https://api.okrapdf.com/v1/documents/doc-abc123
// Use as baseURL with any OpenAI-compatible client
```

### With the OpenAI SDK

```ts
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OKRA_API_KEY,
  baseURL: session.modelEndpoint,
});

const res = await openai.chat.completions.create({
  model: 'okra',
  messages: [{ role: 'user', content: 'What is the total amount due?' }],
});
console.log(res.choices[0].message.content);
```

### With the Vercel AI SDK

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

### With curl

```bash
curl https://api.okrapdf.com/v1/documents/doc-abc123/chat/completions \
  -H "Authorization: Bearer $OKRA_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"messages": [{"role": "user", "content": "What is the total?"}]}'
```

## Using the SDK Directly

The SDK has built-in methods so you don't need a separate OpenAI client:

```ts
// Non-streaming
const { answer } = await session.prompt('What is the total amount due?');

// Streaming
for await (const event of session.stream('Summarize this document')) {
  if (event.type === 'text_delta') process.stdout.write(event.text);
}
```

## Structured Output

Pass a Zod schema or JSON Schema to get typed extraction:

```ts
import { z } from 'zod';

const Invoice = z.object({
  vendor: z.string(),
  total: z.number(),
  lineItems: z.array(z.object({
    description: z.string(),
    amount: z.number(),
  })),
});

const { data } = await session.prompt('Extract the invoice', {
  schema: Invoice,
});
// data: { vendor: "Acme Corp", total: 1250.00, lineItems: [...] }
```

## Upload

Accepts local file paths, URLs, `Blob`, `ArrayBuffer`, or `Uint8Array`:

```ts
// URL
const session = await okra.sessions.create('https://example.com/report.pdf');

// Bytes
const session = await okra.sessions.create(pdfBytes, {
  upload: { fileName: 'report.pdf' },
});

// Attach to existing document
const session = okra.sessions.from('doc-abc123');
```

## Pages & Entities

```ts
const pages = await session.pages();
const { nodes } = await session.entities({ type: 'table' });
```

## Deterministic URLs

Cloudinary-style predictable URLs for page images and exports:

```ts
import { doc } from 'okrapdf/doc';

const d = doc('doc-abc123');
d.pages(1).image();                    // https://res.okrapdf.com/v1/documents/doc-abc123/pg_1.png
d.pages(1).image({ w: 200, h: 300 }); // .../w_200,h_300/pg_1.png
d.export('markdown');                  // .../export.md
```

## Collections

Query across multiple documents:

```ts
const collections = await okra.collections.list();
const collection = await okra.collections.get('col-abc123');
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

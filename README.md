# OkraPDF SDK

The official SDK for integrating with OkraPDF's document processing and financial data extraction capabilities.

## Structure

This repository is a monorepo containing:

- **`@okrapdf/sdk`**: The main client SDK for interacting with the OkraPDF API.
- **`@okrapdf/refinery`**: Shared types and utilities for financial data verification and "safe metadata" analytics.

## Installation

```bash
npm install @okrapdf/sdk
# or
pnpm add @okrapdf/sdk
# or
yarn add @okrapdf/sdk
```

## Usage

### Client Initialization

```typescript
import OkraClient from '@okrapdf/sdk';

const client = new OkraClient({
  apiKey: process.env.OKRA_API_KEY, // Optional if set in environment
});
```

### Listing Documents

```typescript
const documents = await client.documents.list();
console.log(documents);
```

### Uploading a Document

```typescript
const file = // ... File object or Blob
const response = await client.documents.upload(file, 'invoice.pdf');
console.log('Document uploaded:', response.documentUuid);
```

### Chat with Documents

```typescript
// 1. Provision a chat store (required first)
const storeName = await client.chat.provisionStore(documentUuid);

// 2. Send messages
const response = await client.chat.generate(storeName, [
  { role: 'user', content: 'What is the total amount?' }
]);

console.log(response.text);
```

### Retrieving Extractions

```typescript
const extractions = await client.extractions.get(documentUuid);
console.log('Extracted tables:', extractions.results);
```

## Development

1. Install dependencies:
   ```bash
   pnpm install
   ```

2. Build all packages:
   ```bash
   pnpm build
   ```

3. Run tests:
   ```bash
   pnpm test
   ```

## License

MIT

import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { OkraClient } from './client.js';
import { StructuredOutputError } from './errors.js';
import { createOkra } from './index.js';

describe('OkraClient runtime client', () => {
  it('createOkra returns an OkraClient with sessions + upload', () => {
    const okra = createOkra({
      baseUrl: 'https://worker.example.com',
      sharedSecret: 'secret',
    });

    expect(typeof okra.sessions.create).toBe('function');
    expect(typeof okra.sessions.from).toBe('function');
    expect(typeof okra.upload).toBe('function');
  });

  it('uploads URL sources through /upload-url', async () => {
    const fetchMock: typeof fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : input.toString();
      expect(url).toContain('/document/ocr-test-upload/upload-url');
      expect(init?.method).toBe('POST');
      const body = JSON.parse(String(init?.body));
      expect(body.url).toBe('https://example.com/invoice.pdf');
      return new Response(JSON.stringify({ phase: 'uploading' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    const client = new OkraClient({
      baseUrl: 'https://worker.example.com',
      sharedSecret: 'secret',
      fetch: fetchMock,
    });

    const session = await client.upload('https://example.com/invoice.pdf', {
      documentId: 'ocr-test-upload',
    });

    expect(session.id).toBe('ocr-test-upload');
    expect(typeof session.wait).toBe('function');
    expect(typeof session.pages).toBe('function');
  });

  it('passes OpenRedact policy through /upload-url payload', async () => {
    const fetchMock: typeof fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : input.toString();
      expect(url).toContain('/document/ocr-redact-upload/upload-url');
      expect(init?.method).toBe('POST');
      const body = JSON.parse(String(init?.body));
      expect(body).toMatchObject({
        url: 'https://example.com/sensitive.pdf',
        visibility: 'private',
        redact: {
          pii: {
            preset: 'hipaa',
            patterns: ['SSN', 'EMAIL', 'PHONE_US'],
            includeNames: true,
            includeAddresses: true,
          },
          publicFieldAllowlist: ['Form W-9', 'Part I'],
        },
      });
      return new Response(JSON.stringify({ phase: 'uploading' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    const client = new OkraClient({
      baseUrl: 'https://worker.example.com',
      sharedSecret: 'secret',
      fetch: fetchMock,
    });

    const session = await client.upload('https://example.com/sensitive.pdf', {
      documentId: 'ocr-redact-upload',
      redact: {
        pii: {
          preset: 'hipaa',
          patterns: ['SSN', 'EMAIL', 'PHONE_US'],
          includeNames: true,
          includeAddresses: true,
        },
        publicFieldAllowlist: ['Form W-9', 'Part I'],
      },
    });

    expect(session.id).toBe('ocr-redact-upload');
  });

  it('uploads browser File objects via binary upload', async () => {
    const fetchMock: typeof fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : input.toString();
      expect(url).toContain('/document/ocr-browser-file/upload');
      expect(init?.method).toBe('POST');

      const headers = new Headers(init?.headers);
      expect(headers.get('Content-Type')).toBe('application/pdf');
      expect(headers.get('X-File-Name')).toBe('invoice.pdf');
      expect(headers.get('Authorization')).toBe('Bearer test-key');

      expect(init?.body).toBeInstanceOf(Uint8Array);
      const body = init?.body as Uint8Array;
      expect(body.length).toBeGreaterThan(0);

      return new Response(JSON.stringify({ phase: 'uploading' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    const client = new OkraClient({
      baseUrl: 'https://worker.example.com',
      apiKey: 'test-key',
      fetch: fetchMock,
    });

    const file = new File([new Uint8Array([37, 80, 68, 70])], 'invoice.pdf', {
      type: 'application/pdf',
    });
    const session = await client.upload(file, { documentId: 'ocr-browser-file' });

    expect(session.id).toBe('ocr-browser-file');
    expect(typeof session.wait).toBe('function');
  });

  it('uploads local file paths in Node runtimes', async () => {
    const fixtureDir = await mkdtemp(join(tmpdir(), 'okra-runtime-upload-'));
    const fixturePath = join(fixtureDir, 'local-file.pdf');
    await writeFile(fixturePath, new Uint8Array([37, 80, 68, 70]));

    try {
      const fetchMock: typeof fetch = async (input, init) => {
        const url = typeof input === 'string' ? input : input.toString();
        expect(url).toContain('/document/ocr-local-file/upload');
        expect(init?.method).toBe('POST');

        const headers = new Headers(init?.headers);
        expect(headers.get('X-File-Name')).toBe('local-file.pdf');
        expect(headers.get('x-document-agent-secret')).toBe('secret');
        expect(init?.body).toBeInstanceOf(Uint8Array);

        return new Response(JSON.stringify({ phase: 'uploading' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      };

      const client = new OkraClient({
        baseUrl: 'https://worker.example.com',
        sharedSecret: 'secret',
        fetch: fetchMock,
      });

      const session = await client.upload(fixturePath, { documentId: 'ocr-local-file' });
      expect(session.id).toBe('ocr-local-file');
      expect(typeof session.wait).toBe('function');
    } finally {
      await rm(fixtureDir, { recursive: true, force: true });
    }
  });

  it('returns typed structured output via generate({ schema })', async () => {
    const fetchMock: typeof fetch = async (input) => {
      const url = typeof input === 'string' ? input : input.toString();
      expect(url).toContain('/document/ocr-123/structured-output');
      return new Response(
        JSON.stringify({
          data: { vendor: 'Acme', invoiceNumber: 'INV-001', total: 42 },
          meta: { confidence: 0.94, model: 'test-model', durationMs: 120 },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    };

    const client = new OkraClient({
      baseUrl: 'https://worker.example.com',
      sharedSecret: 'secret',
      fetch: fetchMock,
    });

    const schema = z.object({
      vendor: z.string(),
      invoiceNumber: z.string(),
      total: z.number(),
    });

    const result = await client.generate('ocr-123', 'Extract invoice fields', { schema });

    expect(result.data!.vendor).toBe('Acme');
    expect(result.data!.total).toBe(42);
    expect(result.meta!.model).toBe('test-model');
  });

  it('maps structured-output API errors to StructuredOutputError', async () => {
    const fetchMock: typeof fetch = async () => {
      return new Response(
        JSON.stringify({
          code: 'SCHEMA_VALIDATION_FAILED',
          message: 'Structured output failed schema validation',
          details: [{ path: '$.total', message: 'expected number' }],
        }),
        { status: 422, headers: { 'Content-Type': 'application/json' } },
      );
    };

    const client = new OkraClient({
      baseUrl: 'https://worker.example.com',
      sharedSecret: 'secret',
      fetch: fetchMock,
    });

    await expect(
      client.generate(
        'ocr-123',
        'Extract total',
        { schema: { type: 'object', properties: { total: { type: 'number' } }, required: ['total'] } },
      ),
    ).rejects.toMatchObject<Partial<StructuredOutputError>>({
      name: 'StructuredOutputError',
      code: 'SCHEMA_VALIDATION_FAILED',
      status: 422,
    });
  });

  it('waits until document reaches complete phase', async () => {
    let calls = 0;
    const fetchMock: typeof fetch = async () => {
      calls++;
      const phase = calls < 2 ? 'parsing' : 'complete';
      return new Response(JSON.stringify({ phase }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    const client = new OkraClient({
      baseUrl: 'https://worker.example.com',
      sharedSecret: 'secret',
      fetch: fetchMock,
    });

    const status = await client.wait('ocr-123', { pollIntervalMs: 1, timeoutMs: 100 });
    expect(status.phase).toBe('complete');
    expect(calls).toBeGreaterThanOrEqual(2);
  });

  it('returns modelEndpoint URL', () => {
    const client = new OkraClient({
      baseUrl: 'https://api.okrapdf.com',
      sharedSecret: 'secret',
    });

    expect(client.modelEndpoint('ocr-abc123')).toBe(
      'https://api.okrapdf.com/v1/documents/ocr-abc123',
    );
  });

  it('generates plain Q&A answer', async () => {
    const fetchMock: typeof fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : input.toString();
      expect(url).toContain('/document/ocr-456/chat/completions');
      expect(init?.method).toBe('POST');
      const body = JSON.parse(String(init?.body));
      expect(body.messages).toEqual([{ role: 'user', content: 'What was revenue?' }]);
      return new Response(
        JSON.stringify({
          id: 'chatcmpl-test',
          object: 'chat.completion',
          created: 1234567890,
          model: 'kimi-k2p5',
          choices: [{ index: 0, message: { role: 'assistant', content: 'Revenue was $42M' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    };

    const client = new OkraClient({
      baseUrl: 'https://worker.example.com',
      sharedSecret: 'secret',
      fetch: fetchMock,
    });

    const result = await client.generate('ocr-456', 'What was revenue?');
    expect(result.answer).toBe('Revenue was $42M');
  });

  it('creates session handles and binds model for prompt/stream calls', async () => {
    const completionBodies: Array<Record<string, unknown>> = [];
    const fetchMock: typeof fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : input.toString();

      if (url.includes('/document/ocr-session-1/upload-url')) {
        return new Response(JSON.stringify({ phase: 'uploading' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (url.includes('/document/ocr-session-1/chat/completions')) {
        const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
        completionBodies.push(body);

        if (body.stream !== true) {
          return new Response(
            JSON.stringify({
              id: 'chatcmpl-1',
              object: 'chat.completion',
              created: 1234567890,
              model: 'kimi-k2p5',
              choices: [{ index: 0, message: { role: 'assistant', content: 'Revenue is $42M' }, finish_reason: 'stop' }],
              usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          );
        }

        // SSE streaming response
        return new Response(
          `data: ${JSON.stringify({ id: 'chatcmpl-2', object: 'chat.completion.chunk', created: 1234567890, model: 'kimi-k2p5', choices: [{ index: 0, delta: { content: '- Summary bullet' }, finish_reason: null }] })}\n\n`
          + `data: ${JSON.stringify({ id: 'chatcmpl-2', object: 'chat.completion.chunk', created: 1234567890, model: 'kimi-k2p5', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] })}\n\n`
          + `data: [DONE]\n\n`,
          { status: 200, headers: { 'Content-Type': 'text/event-stream' } },
        );
      }

      throw new Error(`Unexpected URL: ${url}`);
    };

    const client = new OkraClient({
      baseUrl: 'https://worker.example.com',
      sharedSecret: 'secret',
      fetch: fetchMock,
    });

    const session = await client.sessions.create('https://example.com/report.pdf', {
      wait: false,
      model: 'kimi-k2p5',
      upload: { documentId: 'ocr-session-1' },
    });

    expect(session.state()).toEqual({
      id: 'ocr-session-1',
      model: 'kimi-k2p5',
      modelEndpoint: 'https://worker.example.com/v1/documents/ocr-session-1',
    });

    const first = await session.prompt('What is total revenue?');
    expect(first.answer).toBe('Revenue is $42M');

    const events = [];
    for await (const event of session.stream('Summarize in 3 bullets')) {
      events.push(event);
    }
    expect(events).toMatchObject([
      { type: 'text_delta', text: '- Summary bullet' },
      { type: 'done', answer: '- Summary bullet' },
    ]);

    await session.setModel('other-model');
    await session.prompt('Use new model');

    expect(completionBodies[0]).toMatchObject({
      messages: [{ role: 'user', content: 'What is total revenue?' }],
      model: 'kimi-k2p5',
    });
    expect(completionBodies[1]).toMatchObject({
      messages: [{ role: 'user', content: 'Summarize in 3 bullets' }],
      model: 'kimi-k2p5',
      stream: true,
    });
    expect(completionBodies[2]).toMatchObject({
      messages: [{ role: 'user', content: 'Use new model' }],
      model: 'other-model',
    });
  });

  it('hydrates a session from document ID without re-uploading', async () => {
    let uploadCalls = 0;
    let completionCalls = 0;
    const fetchMock: typeof fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : input.toString();

      if (url.includes('/upload-url') || url.includes('/upload')) {
        uploadCalls += 1;
      }

      if (url.includes('/document/ocr-existing/chat/completions')) {
        completionCalls += 1;
        const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
        expect(body.model).toBe('kimi-k2p5');
        return new Response(
          JSON.stringify({
            id: 'chatcmpl-existing',
            object: 'chat.completion',
            created: 1234567890,
            model: 'kimi-k2p5',
            choices: [{ index: 0, message: { role: 'assistant', content: 'This is an existing document.' }, finish_reason: 'stop' }],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }

      throw new Error(`Unexpected URL: ${url}`);
    };

    const client = new OkraClient({
      baseUrl: 'https://worker.example.com',
      sharedSecret: 'secret',
      fetch: fetchMock,
    });

    const session = client.sessions.from('ocr-existing', { model: 'kimi-k2p5' });
    const result = await session.prompt('What is this?');

    expect(result.answer).toBe('This is an existing document.');
    expect(uploadCalls).toBe(0);
    expect(completionCalls).toBe(1);
  });

  it('follows session flow: upload-url -> status poll -> completion', async () => {
    const requestLog: Array<{
      method: string;
      path: string;
      body?: Record<string, unknown>;
    }> = [];
    let statusCalls = 0;

    const fetchMock: typeof fetch = async (input, init) => {
      const url = new URL(typeof input === 'string' ? input : input.toString());
      const method = init?.method || 'GET';
      const bodyText = typeof init?.body === 'string' ? init.body : null;
      const body = bodyText ? JSON.parse(bodyText) as Record<string, unknown> : undefined;
      requestLog.push({ method, path: url.pathname, body });

      if (url.pathname === '/document/ocr-curl-shape/upload-url') {
        return new Response(JSON.stringify({ phase: 'uploading' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (url.pathname === '/document/ocr-curl-shape/status') {
        statusCalls += 1;
        const phase = statusCalls < 2 ? 'parsing' : 'complete';
        return new Response(JSON.stringify({ phase, pagesTotal: 1 }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (url.pathname === '/document/ocr-curl-shape/chat/completions') {
        return new Response(JSON.stringify({
          id: 'chatcmpl-curl',
          object: 'chat.completion',
          created: 1234567890,
          model: 'kimi-k2p5',
          choices: [{ index: 0, message: { role: 'assistant', content: 'Revenue is $42M' }, finish_reason: 'stop' }],
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      throw new Error(`Unexpected URL: ${url.toString()}`);
    };

    const client = new OkraClient({
      baseUrl: 'https://worker.example.com',
      sharedSecret: 'secret',
      fetch: fetchMock,
    });

    const session = await client.sessions.create('https://example.com/report.pdf', {
      model: 'kimi-k2p5',
      upload: { documentId: 'ocr-curl-shape' },
      waitOptions: { pollIntervalMs: 1, timeoutMs: 100 },
    });

    const result = await session.prompt('What is revenue?');
    expect(result.answer).toBe('Revenue is $42M');
    expect(statusCalls).toBe(2);

    expect(requestLog[0]).toMatchObject({
      method: 'POST',
      path: '/document/ocr-curl-shape/upload-url',
      body: {
        url: 'https://example.com/report.pdf',
        visibility: 'private',
      },
    });
    expect(requestLog[1]).toMatchObject({
      method: 'GET',
      path: '/document/ocr-curl-shape/status',
    });
    expect(requestLog[2]).toMatchObject({
      method: 'GET',
      path: '/document/ocr-curl-shape/status',
    });
    expect(requestLog[3]).toMatchObject({
      method: 'POST',
      path: '/document/ocr-curl-shape/chat/completions',
      body: {
        messages: [{ role: 'user', content: 'What is revenue?' }],
        model: 'kimi-k2p5',
      },
    });
  });

  it('passes share-link response through from API', async () => {
    const fetchMock: typeof fetch = async () => {
      return new Response(
        JSON.stringify({
          documentId: 'ocr-789',
          token: 'tok_test',
          tokenHint: 'tok_***',
          links: {
            markdown: 'https://view.okrapdf.com/s/sig_abc123/q4-report.md',
            pdf: 'https://view.okrapdf.com/s/sig_abc123/q4-report.pdf',
            completion: null,
          },
          capabilities: { canViewPdf: true },
          role: 'viewer',
          expiresAt: 1_700_000_000_000,
          maxViews: null,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    };

    const client = new OkraClient({
      baseUrl: 'https://worker.example.com',
      sharedSecret: 'secret',
      fetch: fetchMock,
    });

    const result = await client.shareLink('ocr-789', { role: 'viewer' });
    expect(result.links).toEqual({
      markdown: 'https://view.okrapdf.com/s/sig_abc123/q4-report.md',
      pdf: 'https://view.okrapdf.com/s/sig_abc123/q4-report.pdf',
      completion: null,
    });
    expect(result.capabilities).toEqual({ canViewPdf: true });
  });

  it('handles ask-role share links with completion URL', async () => {
    const fetchMock: typeof fetch = async () => {
      return new Response(
        JSON.stringify({
          documentId: 'ocr-ask',
          token: 'tok_ask',
          tokenHint: 'tok_***',
          links: {
            markdown: 'https://view.okrapdf.com/s/sig_ask123/report.md',
            pdf: 'https://view.okrapdf.com/s/sig_ask123/report.pdf',
            completion: 'https://api.okrapdf.com/document/ocr-ask/completion?token=tok_ask',
          },
          capabilities: { canViewPdf: true },
          role: 'ask',
          expiresAt: 1_700_000_000_000,
          maxViews: 100,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    };

    const client = new OkraClient({
      baseUrl: 'https://worker.example.com',
      sharedSecret: 'secret',
      fetch: fetchMock,
    });

    const result = await client.shareLink('ocr-ask', { role: 'ask' });
    expect(result.links).toEqual({
      markdown: 'https://view.okrapdf.com/s/sig_ask123/report.md',
      pdf: 'https://view.okrapdf.com/s/sig_ask123/report.pdf',
      completion: 'https://api.okrapdf.com/document/ocr-ask/completion?token=tok_ask',
    });
    expect(result.capabilities).toEqual({ canViewPdf: true });
  });

  it('sends admin role when creating share links', async () => {
    let requestBody: Record<string, unknown> | null = null;
    const fetchMock: typeof fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : input.toString();
      expect(url).toContain('/document/ocr-admin/share-link');
      expect(init?.method).toBe('POST');
      requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return new Response(
        JSON.stringify({
          documentId: 'ocr-admin',
          token: 'tok_admin',
          tokenHint: 'tok_***',
          links: {
            markdown: 'https://view.okrapdf.com/s/sig_admin456/financials.md',
            pdf: 'https://view.okrapdf.com/s/sig_admin456/financials.pdf',
            completion: null,
          },
          capabilities: { canViewPdf: true },
          role: 'admin',
          expiresAt: 1_700_000_000_000,
          maxViews: 100,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    };

    const client = new OkraClient({
      baseUrl: 'https://worker.example.com',
      sharedSecret: 'secret',
      fetch: fetchMock,
    });

    const result = await client.shareLink('ocr-admin', {
      role: 'admin',
      expiresInMs: 3_600_000,
      maxViews: 100,
    });

    expect(requestBody).toEqual({
      role: 'admin',
      label: undefined,
      expiresInMs: 3_600_000,
      maxViews: 100,
    });
    expect(result.role).toBe('admin');
    expect(result.links.markdown).toBe('https://view.okrapdf.com/s/sig_admin456/financials.md');
    expect(result.links.pdf).toBe('https://view.okrapdf.com/s/sig_admin456/financials.pdf');
  });

});

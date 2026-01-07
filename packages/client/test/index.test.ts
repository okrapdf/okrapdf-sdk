import { describe, it, expect, vi } from 'vitest';
import { OkraClient } from '../src/index';

describe('OkraClient', () => {
  it('should instantiate with default config', () => {
    const client = new OkraClient({ apiKey: 'test-key' });
    expect(client).toBeDefined();
    expect(client.documents).toBeDefined();
    expect(client.chat).toBeDefined();
    expect(client.extractions).toBeDefined();
  });

  it('should set headers correctly', async () => {
    const client = new OkraClient({ apiKey: 'test-key' });
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({}),
    } as Response);

    await client.fetch('/test');

    const [url, options] = fetchSpy.mock.calls[0];
    expect(url).toContain('/test');
    
    const headers = options?.headers as Headers;
    expect(headers).toBeDefined();
    expect(headers.get('Authorization')).toBe('Bearer test-key');
    expect(headers.get('Content-Type')).toBe('application/json');
  });
});

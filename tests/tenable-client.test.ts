import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TenableClient } from '../src/tenable-client.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function jsonResponse(body: unknown, status = 200, headers?: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    statusText: status === 200 ? 'OK' : `Error ${status}`,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TenableClient', () => {
  let mockFetch: ReturnType<typeof vi.fn>;
  let client: TenableClient;

  beforeEach(() => {
    mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);
    client = new TenableClient({
      baseUrl: 'https://cloud.tenable.com',
      accessKey: 'test-access',
      secretKey: 'test-secret',
      maxRetries: 0,
      rateLimitPerMin: 6000,
    });
  });

  // -------------------------------------------------------------------------
  // Auth header
  // -------------------------------------------------------------------------

  it('sends correct X-ApiKeys header', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ ok: true }));
    await client.get('/test');

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://cloud.tenable.com/test');
    expect((init.headers as Record<string, string>)['X-ApiKeys']).toBe(
      'accessKey=test-access;secretKey=test-secret',
    );
  });

  // -------------------------------------------------------------------------
  // GET request
  // -------------------------------------------------------------------------

  it('resolves with parsed JSON on GET 200', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ data: 'test' }));
    const result = await client.get('/endpoint');
    expect(result).toEqual({ data: 'test' });

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe('GET');
  });

  // -------------------------------------------------------------------------
  // POST request
  // -------------------------------------------------------------------------

  it('sends JSON body on POST', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ id: 1 }));
    await client.post('/endpoint', { key: 'val' });

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe('POST');
    expect(init.body).toBe(JSON.stringify({ key: 'val' }));
    expect((init.headers as Record<string, string>)['Content-Type']).toBe(
      'application/json',
    );
  });

  // -------------------------------------------------------------------------
  // HTTP error mapping
  // -------------------------------------------------------------------------

  it('rejects on HTTP 401', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ error: 'unauthorized' }, 401));
    await expect(client.get('/test')).rejects.toThrow(/401/);
  });

  it('rejects on HTTP 404', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ error: 'not found' }, 404));
    await expect(client.get('/test')).rejects.toThrow(/404/);
  });

  it('rejects on HTTP 429 with retry-after', async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({ error: 'rate limited' }, 429, { 'retry-after': '60' }),
    );
    await expect(client.get('/test')).rejects.toThrow(/429/);
  });

  it('rejects on HTTP 500', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ error: 'server error' }, 500));
    await expect(client.get('/test')).rejects.toThrow(/500/);
  });

  // -------------------------------------------------------------------------
  // Timeout
  // -------------------------------------------------------------------------

  it('rejects when request exceeds timeout', async () => {
    mockFetch.mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          // Listen for the abort signal and reject when it fires
          if (init.signal) {
            init.signal.addEventListener('abort', () => {
              reject(init.signal!.reason ?? new DOMException('The operation was aborted.', 'AbortError'));
            });
          }
        }),
    );

    const shortClient = new TenableClient({
      baseUrl: 'https://cloud.tenable.com',
      accessKey: 'test-access',
      secretKey: 'test-secret',
      timeoutMs: 50,
      maxRetries: 0,
      rateLimitPerMin: 6000,
    });

    await expect(shortClient.get('/slow')).rejects.toThrow(/timed out/i);
  }, 10_000);

  // -------------------------------------------------------------------------
  // Base URL normalization
  // -------------------------------------------------------------------------

  it('strips trailing slash from baseUrl', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ ok: true }));

    const slashClient = new TenableClient({
      baseUrl: 'https://cloud.tenable.com/',
      accessKey: 'a',
      secretKey: 's',
      maxRetries: 0,
      rateLimitPerMin: 6000,
    });

    await slashClient.get('/test');
    const [url] = mockFetch.mock.calls[0] as [string];
    expect(url).toBe('https://cloud.tenable.com/test');
  });
});

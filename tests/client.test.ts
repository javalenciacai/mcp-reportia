/**
 * Tests for `Client.call` — query-param forwarding to the outgoing URL.
 *
 * The 2026-09-12 production regression (REQ-MCP-OUTPUT-04 chain round 5):
 *   - `src/client.ts` line 262 (pre-fix) called `buildUrl(endpoint)` without
 *     forwarding `opts.query`. The `rawFetch` opts type also omitted `query`,
 *     so TypeScript's structural typing didn't flag the missing argument.
 *   - Result: every filter param (`dateFrom`, `dateTo`, `limit`, `offset`,
 *     `nit`, `numeroDocumento`, `tipoComprobante`, `emailStatus`) was silently
 *     dropped before reaching Reportia, producing empty result sets.
 *
 * These tests pin the transport-layer contract: `Client.call` MUST serialize
 * `opts.query` into the outgoing URL, omitting only keys whose value is
 * `undefined`. They reproduce the bug exactly via undici mock — same pattern
 * as the exploratory script `tmp/test-buildurl.cjs`, but as proper vitest
 * cases with `expect().toContain(...)` assertions.
 */
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

// vi.hoisted runs before vi.mock's factory (vitest hoists vi.mock to the top
// of the file, but vi.hoisted values are injected into the factory closure).
const { requestMock } = vi.hoisted(() => ({
  requestMock: vi.fn(),
}));

// Replace only `request` in undici; keep `Agent` / `FormData` real so the
// client can still instantiate the dispatcher pool locally.
vi.mock('undici', async (importOriginal) => {
  const actual = await importOriginal<typeof import('undici')>();
  return { ...actual, request: requestMock };
});

import { createClient } from '../src/client.js';
import { buildTestConfig } from '../src/config.js';

function lastUrl(): string {
  const call = requestMock.mock.calls[0];
  if (!call) throw new Error('undici.request was not called');
  return String(call[0]);
}

describe('client.call() forwards opts.query into the outgoing URL', () => {
  beforeEach(() => {
    requestMock.mockReset();
    // Capture the URL and short-circuit the network call. We don't need a
    // real response — we just want to verify what URL the client built.
    // rawFetch wraps the throw in `NetworkError`, which we catch in each test.
    requestMock.mockImplementation(async (url: unknown) => {
      // Touch the arg so TS keeps the parameter and so a missing URL fails fast.
      void url;
      throw new Error('STOP_AT_REQUEST');
    });
  });

  it('serializes every defined query key into the URL (dateFrom, dateTo, limit)', async () => {
    const client = createClient(buildTestConfig({ baseUrl: 'https://reportia.test' }));

    // client.call rejects with NetworkError because we short-circuited undici.
    await expect(
      client.call('/api/companies/1/movements', {
        method: 'GET',
        query: { dateFrom: '2026-02-01', dateTo: '2026-02-02', limit: 100 },
      }),
    ).rejects.toThrow();

    const url = lastUrl();
    expect(url).toContain('dateFrom=2026-02-01');
    expect(url).toContain('dateTo=2026-02-02');
    expect(url).toContain('limit=100');
    // The URL must remain rooted at the configured base.
    expect(url.startsWith('https://reportia.test/')).toBe(true);
  });

  it('produces a URL without `?...` when no query options are supplied', async () => {
    const client = createClient(buildTestConfig({ baseUrl: 'https://reportia.test' }));

    await expect(
      client.call('/api/companies/1/movements', { method: 'GET' }),
    ).rejects.toThrow();

    const url = lastUrl();
    expect(url).toBe('https://reportia.test/api/companies/1/movements');
    expect(url).not.toContain('?');
  });

  it('omits keys whose value is `undefined`, keeps defined keys', async () => {
    const client = createClient(buildTestConfig({ baseUrl: 'https://reportia.test' }));

    await expect(
      client.call('/api/companies/1/movements', {
        method: 'GET',
        query: { dateFrom: undefined, limit: 100 },
      }),
    ).rejects.toThrow();

    const url = lastUrl();
    expect(url).toContain('limit=100');
    // The undefined key must be skipped — no `dateFrom=` fragment at all,
    // including the `dateFrom=undefined` literal that URLSearchParams would
    // produce for a string-cast undefined.
    expect(url).not.toContain('dateFrom');
  });
});

afterAll(() => {
  // requestMock is shared across describe blocks via vi.hoisted — clear it
  // so a follow-up test file (e.g. if vitest reorders files) doesn't see
  // leftover calls.
  requestMock.mockReset();
});
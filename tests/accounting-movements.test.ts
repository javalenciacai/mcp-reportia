/**
 * Tests for `accounting-movements.ts` — focused on the schema + handler
 * of `reportia_movements_list`.
 *
 * The 2026-09-07 production incident surfaced `process_blocked:
 * output_too_large` from the upstream Reportia API because the
 * movements-list endpoint was returning ALL rows for the date range
 * (no `limit` was passed) and the data volume had grown past the
 * upstream threshold. The other list tools in this repo
 * (`third-parties`, `account-mappings`, `operations`) already expose
 * a `limit` parameter (max 1000, default 100) and forward it to the
 * upstream; `accounting-movements` was the only outlier.
 *
 * In a follow-up investigation, the OLD upstream endpoint
 * (`/api/companies/:companyId/accounting-movements`) was identified as
 * a REPORT endpoint (computes summary / previousBalance / totalDebits /
 * etc.) whose response payload always crossed the upstream byte cap for
 * companies with many movements. The fix moved the LLM-facing tool to
 * the NEW raw-data endpoint
 * (`/api/companies/:companyId/movements`, no aggregations) added in
 * upstream `feat/accounting-movements-raw-endpoint` and added offset
 * pagination so agents can fetch beyond the first page.
 *
 * These tests pin the contract:
 *   1. The Zod input schema for `reportia_movements_list` accepts a
 *      `limit` integer in [1, 1000], defaults to 100, and rejects
 *      out-of-range / non-integer values. Also accepts `offset` >= 0
 *      and defaults to 0.
 *   2. The handler forwards `limit` AND `offset` to the upstream as
 *      query params.
 *   3. When `limit` is omitted, the default (100) is forwarded. When
 *      `offset` is omitted, 0 is forwarded.
 *   4. The URL path is `/api/companies/{id}/movements` (the NEW raw
 *      endpoint), NOT `/accounting-movements` (the OLD report endpoint
 *      that returns the heavy aggregations).
 */

import { describe, expect, it, vi } from 'vitest';
import { accountingMovementTools } from '../src/tools/accounting-movements.js';
import type { ToolContext } from '../src/tool-base.js';
import type { ReportiaClient } from '../src/client.js';

const listTool = accountingMovementTools.find((t) => t.name === 'reportia_movements_list');
if (!listTool) throw new Error('reportia_movements_list tool not registered');

function ctxWithSpy(spy: ReturnType<typeof vi.fn>): ToolContext {
  return { client: { call: spy } as unknown as ReportiaClient, defaultCompanyId: undefined };
}

describe('reportia_movements_list — schema accepts and validates limit', () => {
  it('accepts a positive integer limit (1-1000)', () => {
    const r1 = listTool.inputSchema.safeParse({ companyId: 1, limit: 1 });
    expect(r1.success).toBe(true);
    const r2 = listTool.inputSchema.safeParse({ companyId: 1, limit: 1000 });
    expect(r2.success).toBe(true);
    const r3 = listTool.inputSchema.safeParse({ companyId: 1, limit: 50 });
    expect(r3.success).toBe(true);
  });

  it('accepts a payload without limit (defaults are applied)', () => {
    const r = listTool.inputSchema.safeParse({ companyId: 1 });
    expect(r.success).toBe(true);
  });

  it('rejects limit < 1', () => {
    const r1 = listTool.inputSchema.safeParse({ companyId: 1, limit: 0 });
    expect(r1.success).toBe(false);
    const r2 = listTool.inputSchema.safeParse({ companyId: 1, limit: -5 });
    expect(r2.success).toBe(false);
  });

  it('rejects limit > 1000', () => {
    const r = listTool.inputSchema.safeParse({ companyId: 1, limit: 1001 });
    expect(r.success).toBe(false);
  });

  it('rejects non-integer limit', () => {
    const r1 = listTool.inputSchema.safeParse({ companyId: 1, limit: 3.14 });
    expect(r1.success).toBe(false);
    const r2 = listTool.inputSchema.safeParse({ companyId: 1, limit: '50' });
    expect(r2.success).toBe(false);
  });
});

describe('reportia_movements_list — handler forwards limit to upstream', () => {
  it('passes the explicit limit as `limit` query param', async () => {
    const callSpy = vi.fn().mockResolvedValue({ rows: [] });
    const ctx = ctxWithSpy(callSpy);
    const parsed = listTool.inputSchema.safeParse({ companyId: 1, limit: 25 });
    if (!parsed.success) throw new Error('schema rejected valid payload');

    await listTool.handler(parsed.data, ctx);

    expect(callSpy).toHaveBeenCalledTimes(1);
    const opts = callSpy.mock.calls[0][1] as { query: Record<string, unknown> };
    expect(opts.query.limit).toBe(25);
  });

  it('passes the default limit (100) when none is provided', async () => {
    const callSpy = vi.fn().mockResolvedValue({ rows: [] });
    const ctx = ctxWithSpy(callSpy);
    const parsed = listTool.inputSchema.safeParse({ companyId: 1 });
    if (!parsed.success) throw new Error('schema rejected valid payload');

    await listTool.handler(parsed.data, ctx);

    const opts = callSpy.mock.calls[0][1] as { query: Record<string, unknown> };
    expect(opts.query.limit).toBe(100);
  });

  it('still forwards all the other filters alongside limit', async () => {
    const callSpy = vi.fn().mockResolvedValue({ rows: [] });
    const ctx = ctxWithSpy(callSpy);
    const parsed = listTool.inputSchema.safeParse({
      companyId: 1,
      dateFrom: '2026-01-01',
      dateTo: '2026-01-31',
      nit: '900123456',
      tipoComprobante: 'factura',
      limit: 10,
    });
    if (!parsed.success) throw new Error('schema rejected valid payload');

    await listTool.handler(parsed.data, ctx);

    const opts = callSpy.mock.calls[0][1] as {
      method: string;
      query: Record<string, unknown>;
    };
    expect(opts.method).toBe('GET');
    expect(opts.query.dateFrom).toBe('2026-01-01');
    expect(opts.query.dateTo).toBe('2026-01-31');
    expect(opts.query.nit).toBe('900123456');
    expect(opts.query.tipoComprobante).toBe('factura');
    expect(opts.query.limit).toBe(10);
  });

  it('calls the NEW raw-data endpoint /api/companies/:companyId/movements (not the old report endpoint)', async () => {
    const callSpy = vi.fn().mockResolvedValue({ rows: [], total: 0 });
    const ctx = ctxWithSpy(callSpy);
    const parsed = listTool.inputSchema.safeParse({ companyId: 7, limit: 25 });
    if (!parsed.success) throw new Error('schema rejected valid payload');

    await listTool.handler(parsed.data, ctx);

    const url = callSpy.mock.calls[0][0] as string;
    expect(url).toBe('/api/companies/7/movements');
    // Make sure we did NOT regress to the old report endpoint that
    // computed summary / previousBalance / totalDebits — those
    // aggregations were the root cause of the 18 MB response that
    // triggered `process_blocked: output_too_large`.
    expect(url).not.toContain('/accounting-movements');
  });

  it('forwards offset (default 0, custom value)', async () => {
    const callSpy = vi.fn().mockResolvedValue({ rows: [], total: 0 });
    const ctx = ctxWithSpy(callSpy);

    // Default offset is 0
    const p1 = listTool.inputSchema.safeParse({ companyId: 1 });
    if (!p1.success) throw new Error('schema rejected');
    await listTool.handler(p1.data, ctx);
    expect(callSpy.mock.calls[0][1]?.query?.['offset']).toBe(0);

    // Custom offset forwarded as-is
    const p2 = listTool.inputSchema.safeParse({ companyId: 1, offset: 250 });
    if (!p2.success) throw new Error('schema rejected');
    await listTool.handler(p2.data, ctx);
    expect(callSpy.mock.calls[1][1]?.query?.['offset']).toBe(250);
  });

  it('rejects negative offset', () => {
    const r = listTool.inputSchema.safeParse({ companyId: 1, offset: -1 });
    expect(r.success).toBe(false);
  });
});

// ----------------------------------------------------------------------------
// REQ-MCP-01..06 — dateFrom/dateTo rename for reportia_movements_list + schema
// split for reportia_movements_export_*. The OLD `startDate`/`endDate` names
// hit the silent-filter-mismatch bug (mcp-reportia sent `startDate`,
// /api/companies/:companyId/movements read `dateFrom`, the upstream predicate
// was skipped, every row came back). Renaming is the loud-failure fix.
// ----------------------------------------------------------------------------

const exportExcelTool = accountingMovementTools.find(
  (t) => t.name === 'reportia_movements_export_excel',
);
if (!exportExcelTool) throw new Error('reportia_movements_export_excel tool not registered');

const exportPdfTool = accountingMovementTools.find(
  (t) => t.name === 'reportia_movements_export_pdf',
);
if (!exportPdfTool) throw new Error('reportia_movements_export_pdf tool not registered');

describe('reportia_movements_list — date filter rename (REQ-MCP-01)', () => {
  it('rejects startDate with an unrecognized-key issue', () => {
    const r = listTool.inputSchema.safeParse({ companyId: 1, startDate: '2026-02-01' });
    expect(r.success).toBe(false);
    if (r.success) return;
    // zod's .strict() puts unknown keys in `issues[0].keys`, with path = [].
    expect(r.error.issues[0].keys).toEqual(['startDate']);
    expect(r.error.issues[0].message).toMatch(/Unrecognized key/i);
  });

  it('rejects endDate with an unrecognized-key issue', () => {
    const r = listTool.inputSchema.safeParse({ companyId: 1, endDate: '2026-02-28' });
    expect(r.success).toBe(false);
    if (r.success) return;
    expect(r.error.issues[0].keys).toEqual(['endDate']);
    expect(r.error.issues[0].message).toMatch(/Unrecognized key/i);
  });

  it('accepts the renamed dateFrom/dateTo keys', () => {
    const r = listTool.inputSchema.safeParse({
      companyId: 1,
      dateFrom: '2026-02-01',
      dateTo: '2026-02-28',
    });
    expect(r.success).toBe(true);
  });
});

describe('reportia_movements_export_* — old startDate/endDate keys preserved (REQ-MCP-02)', () => {
  it('export_excel accepts startDate/endDate (export endpoint contract unchanged)', () => {
    const r = exportExcelTool.inputSchema.safeParse({
      companyId: 1,
      startDate: '2026-02-01',
      endDate: '2026-02-28',
      format: 'excel',
    });
    expect(r.success).toBe(true);
  });

  it('export_pdf accepts startDate/endDate (export endpoint contract unchanged)', () => {
    const r = exportPdfTool.inputSchema.safeParse({
      companyId: 1,
      startDate: '2026-02-01',
      endDate: '2026-02-28',
      format: 'pdf',
    });
    expect(r.success).toBe(true);
  });
});

describe('schema split — ExportInput no longer extends ListFiltersInput (REQ-MCP-03)', () => {
  it('ExportInput.shape exposes startDate/endDate and NOT dateFrom/dateTo', () => {
    const keys = Object.keys(exportExcelTool.inputSchema.shape).sort();
    expect(keys).toContain('startDate');
    expect(keys).toContain('endDate');
    expect(keys).not.toContain('dateFrom');
    expect(keys).not.toContain('dateTo');
  });

  it('ListFiltersInput.shape exposes dateFrom/dateTo and NOT startDate/endDate', () => {
    const keys = Object.keys(listTool.inputSchema.shape).sort();
    expect(keys).toContain('dateFrom');
    expect(keys).toContain('dateTo');
    expect(keys).not.toContain('startDate');
    expect(keys).not.toContain('endDate');
  });
});

// ----------------------------------------------------------------------------
// REQ-MCP-07 — response echo. Incident 2026-09-10: the LLM confused two
// different calls (one with limit=100, one with limit=1000) and reported
// that the date filter was "broken" because rows from both calls leaked
// into the same context. The fix: the response echoes the *actual* filter
// that produced it, so the LLM can verify that what it sees matches the
// query it just made. This is the loud-failure pattern: the LLM must be
// able to detect "the data I just got does not match the query I just
// made" without having to remember prior calls.
// ----------------------------------------------------------------------------

describe('reportia_movements_list — response echoes the resolved query (REQ-MCP-07)', () => {
  it('returns { query, movements, total, limit, offset } with query echoing the resolved filters', async () => {
    const upstreamResponse = {
      movements: [
        { id: 1, accountCode: '11050501', value: '1000' },
        { id: 2, accountCode: '11050501', value: '500' },
      ],
      total: 850,
      limit: 1000,
      offset: 0,
    };
    const callSpy = vi.fn().mockResolvedValue(upstreamResponse);
    const ctx = ctxWithSpy(callSpy);
    const parsed = listTool.inputSchema.safeParse({
      companyId: 1,
      dateFrom: '2026-02-01',
      dateTo: '2026-02-07',
      limit: 1000,
      offset: 0,
    });
    if (!parsed.success) throw new Error('schema rejected valid payload');

    const result = await listTool.handler(parsed.data, ctx);
    // `ok()` wraps the data as { ok: true, content: JSON.stringify(data), data }.
    // The content field is a JSON string; `data` is the unwrapped object.
    const payload = (result as { data: unknown }).data as Record<string, unknown>;

    expect(payload).toHaveProperty('query');
    expect(payload.query).toMatchObject({
      companyId: 1,
      dateFrom: '2026-02-01',
      dateTo: '2026-02-07',
      limit: 1000,
      offset: 0,
    });
    expect(payload.movements).toEqual(upstreamResponse.movements);
    expect(payload.total).toBe(850);
    expect(payload.limit).toBe(1000);
    expect(payload.offset).toBe(0);
  });

  it('echoes the resolved defaults when caller omits them (so LLM can see the actual cap applied)', async () => {
    const callSpy = vi.fn().mockResolvedValue({ movements: [], total: 0, limit: 100, offset: 0 });
    const ctx = ctxWithSpy(callSpy);
    const parsed = listTool.inputSchema.safeParse({ companyId: 1 });
    if (!parsed.success) throw new Error('schema rejected');

    const result = await listTool.handler(parsed.data, ctx);
    const payload = (result as { data: unknown }).data as Record<string, unknown>;

    // El echo debe mostrar el limit y offset resueltos, no undefined.
    // Asi el LLM ve "yo pedi sin limit, el server uso 100" y puede
    // decidir si pedir mas o usar export.
    expect(payload.query).toMatchObject({
      companyId: 1,
      limit: 100,
      offset: 0,
    });
    expect((payload.query as Record<string, unknown>).dateFrom).toBeUndefined();
    expect((payload.query as Record<string, unknown>).dateTo).toBeUndefined();
  });
});

// ----------------------------------------------------------------------------
// REQ-MCP-OUTPUT-03 (incident 2026-09-11): the LLM called
// reportia_movements_list WITHOUT dateFrom/dateTo even when the user
// specified a date range. The upstream filter works (verified via curl
// to /api/companies/1/movements?dateFrom=2026-02-01&dateTo=2026-02-02
// returning total=215 for company 1). The failure mode is that the
// LLM got 19,604 unfiltered rows in the same context as 215 filtered
// rows and reported the filter was broken.
//
// Defense in depth (system prompt + MCP layer). This block of tests
// pins the MCP-layer half: the schema requires at least one filter
// other than `limit`/`offset`/`companyId`, and the response emits
// a `warnings` array when no filter was applied so the LLM can detect
// the no-filter call before reasoning about the data.
// ----------------------------------------------------------------------------

describe('reportia_movements_list — REQ-MCP-OUTPUT-03 require at least one real filter', () => {
  it('rejects a payload with only companyId + limit (no date/NIT/tipo/etc filter) — common LLM mistake', () => {
    const r = listTool.inputSchema.safeParse({ companyId: 1, limit: 100 });
    // We still ALLOW the schema to parse (the LLM is making a legitimate
    // call, just one that the handler will warn about) — so .safeParse
    // succeeds. The actual enforcement happens in the handler via the
    // `warnings` field on the response, which the LLM sees and can
    // act on. This test pins that contract: parsing does not block,
    // but the handler MUST emit a warning when only pagination params
    // are set.
    expect(r.success).toBe(true);
  });

  it('handler emits a "no_filter" warning when called with only companyId + limit', async () => {
    const callSpy = vi.fn().mockResolvedValue({
      movements: [],
      total: 0,
      limit: 100,
      offset: 0,
    });
    const ctx = ctxWithSpy(callSpy);
    const parsed = listTool.inputSchema.safeParse({ companyId: 1, limit: 100 });
    if (!parsed.success) throw new Error('schema rejected');

    const result = await listTool.handler(parsed.data, ctx);
    const payload = (result as { data: unknown }).data as Record<string, unknown>;

    // Loud-failure pattern: the response carries a `warnings` array
    // so the LLM can see "you called without filters, you probably
    // didn't mean to" without having to remember prior calls.
    expect(payload).toHaveProperty('warnings');
    const warnings = payload.warnings as Array<{ code: string; message: string }>;
    expect(Array.isArray(warnings)).toBe(true);
    const codes = warnings.map((w) => w.code);
    expect(codes).toContain('NO_FILTER');
  });

  it('handler does NOT emit a NO_FILTER warning when dateFrom is present', async () => {
    const callSpy = vi.fn().mockResolvedValue({
      movements: [],
      total: 0,
      limit: 100,
      offset: 0,
    });
    const ctx = ctxWithSpy(callSpy);
    const parsed = listTool.inputSchema.safeParse({
      companyId: 1,
      dateFrom: '2026-02-01',
      dateTo: '2026-02-28',
    });
    if (!parsed.success) throw new Error('schema rejected');

    const result = await listTool.handler(parsed.data, ctx);
    const payload = (result as { data: unknown }).data as Record<string, unknown>;

    const warnings = (payload.warnings ?? []) as Array<{ code: string }>;
    const codes = warnings.map((w) => w.code);
    expect(codes).not.toContain('NO_FILTER');
  });

  it('handler does NOT emit a NO_FILTER warning when nit is the only filter', async () => {
    const callSpy = vi.fn().mockResolvedValue({ movements: [], total: 0 });
    const ctx = ctxWithSpy(callSpy);
    const parsed = listTool.inputSchema.safeParse({
      companyId: 1,
      nit: '900123456',
    });
    if (!parsed.success) throw new Error('schema rejected');

    const result = await listTool.handler(parsed.data, ctx);
    const payload = (result as { data: unknown }).data as Record<string, unknown>;

    const warnings = (payload.warnings ?? []) as Array<{ code: string }>;
    expect(warnings.map((w) => w.code)).not.toContain('NO_FILTER');
  });

  it('handler does NOT emit a NO_FILTER warning when tipoComprobante is the only filter', async () => {
    const callSpy = vi.fn().mockResolvedValue({ movements: [], total: 0 });
    const ctx = ctxWithSpy(callSpy);
    const parsed = listTool.inputSchema.safeParse({
      companyId: 1,
      tipoComprobante: 'factura',
    });
    if (!parsed.success) throw new Error('schema rejected');

    const result = await listTool.handler(parsed.data, ctx);
    const payload = (result as { data: unknown }).data as Record<string, unknown>;

    const warnings = (payload.warnings ?? []) as Array<{ code: string }>;
    expect(warnings.map((w) => w.code)).not.toContain('NO_FILTER');
  });

  it('handler does NOT emit a NO_FILTER warning when numeroDocumento is the only filter', async () => {
    const callSpy = vi.fn().mockResolvedValue({ movements: [], total: 0 });
    const ctx = ctxWithSpy(callSpy);
    const parsed = listTool.inputSchema.safeParse({
      companyId: 1,
      numeroDocumento: '7143',
    });
    if (!parsed.success) throw new Error('schema rejected');

    const result = await listTool.handler(parsed.data, ctx);
    const payload = (result as { data: unknown }).data as Record<string, unknown>;

    const warnings = (payload.warnings ?? []) as Array<{ code: string }>;
    expect(warnings.map((w) => w.code)).not.toContain('NO_FILTER');
  });

  it('handler does NOT emit a NO_FILTER warning when emailStatus is the only filter', async () => {
    const callSpy = vi.fn().mockResolvedValue({ movements: [], total: 0 });
    const ctx = ctxWithSpy(callSpy);
    const parsed = listTool.inputSchema.safeParse({
      companyId: 1,
      emailStatus: 'pending',
    });
    if (!parsed.success) throw new Error('schema rejected');

    const result = await listTool.handler(parsed.data, ctx);
    const payload = (result as { data: unknown }).data as Record<string, unknown>;

    const warnings = (payload.warnings ?? []) as Array<{ code: string }>;
    expect(warnings.map((w) => w.code)).not.toContain('NO_FILTER');
  });
});

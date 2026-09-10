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
    expect(r.error.issues[0].path).toEqual(['startDate']);
    expect(r.error.issues[0].message).toMatch(/Unrecognized key/i);
  });

  it('rejects endDate with an unrecognized-key issue', () => {
    const r = listTool.inputSchema.safeParse({ companyId: 1, endDate: '2026-02-28' });
    expect(r.success).toBe(false);
    if (r.success) return;
    expect(r.error.issues[0].path).toEqual(['endDate']);
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

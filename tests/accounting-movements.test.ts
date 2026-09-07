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
 * These tests pin the fix:
 *   1. The Zod input schema for `reportia_movements_list` accepts a
 *      `limit` integer in [1, 1000], defaults to 100, and rejects
 *      out-of-range / non-integer values.
 *   2. The handler forwards `limit` to the upstream as a query param.
 *   3. When `limit` is omitted, the default (100) is forwarded.
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
      startDate: '2026-01-01',
      endDate: '2026-01-31',
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
    expect(opts.query.startDate).toBe('2026-01-01');
    expect(opts.query.endDate).toBe('2026-01-31');
    expect(opts.query.nit).toBe('900123456');
    expect(opts.query.tipoComprobante).toBe('factura');
    expect(opts.query.limit).toBe(10);
  });
});

/**
 * Tests focalizados para las herramientas de
 * `src/tools/salesperson-invoice.ts`.
 *
 * No se ejecutan handlers reales contra Reportia. Solo se valida:
 *   - Esquemas Zod aceptando entradas validas y rechazando invalidas.
 *   - Guard de confirm=true en las herramientas destructivas.
 *   - Existencia y unicidad de las tools esperadas en `allTools`.
 */
import { describe, expect, it } from 'vitest';
import { allTools } from '../src/tools/index.js';
import { salespersonInvoiceTools } from '../src/tools/salesperson-invoice.js';

const findTool = (name: string) => allTools.find((t) => t.name === name);
const shape = (tool: { inputSchema: { shape: Record<string, unknown> } } | undefined) =>
  tool && (tool.inputSchema as { shape: Record<string, unknown> }).shape;

describe('registro de salesperson-invoice tools', () => {
  it('expone exactamente 11 herramientas en el indice', () => {
    expect(salespersonInvoiceTools.length).toBe(11);
  });

  it('todos los nombres estan registrados en allTools', () => {
    for (const t of salespersonInvoiceTools) {
      expect(findTool(t.name)).toBeDefined();
    }
  });

  it('las herramientas destructivas tienen destructive: true', () => {
    const destructive = [
      'reportia_salesperson_mapping_delete',
      'reportia_invoice_email_send',
      'reportia_invoices_send_multiple',
    ];
    for (const name of destructive) {
      const t = findTool(name);
      expect(t, `tool ${name} debe existir`).toBeDefined();
      expect(t?.destructive, `${name} debe ser destructive`).toBe(true);
    }
  });

  it('las herramientas no-destructivas no declaran destructive', () => {
    const nonDestructive = [
      'reportia_salesperson_mappings_list',
      'reportia_salesperson_mapping_create',
      'reportia_salesperson_mapping_update',
      'reportia_salesperson_options_list',
      'reportia_invoices_list',
      'reportia_invoice_settings_get',
      // reportia_invoice_settings_create/update son DESTRUCTIVAS ahora
      // (revisado en round 1 del judgment-day): pueden sobreescribir
      // configuracion sensible de facturacion.
    ];
    for (const name of nonDestructive) {
      const t = findTool(name);
      expect(t, `tool ${name} debe existir`).toBeDefined();
      expect(t?.destructive, `${name} no debe ser destructive`).toBeFalsy();
    }
  });
});

describe('esquemas - salesperson mappings', () => {
  it('create acepta salespersonId y salespersonName', () => {
    const t = findTool('reportia_salesperson_mapping_create');
    const s = shape(t);
    expect(s?.salespersonId).toBeDefined();
    expect(s?.salespersonName).toBeDefined();
  });

  it('create rechaza salespersonId vacio', () => {
    const t = findTool('reportia_salesperson_mapping_create');
    const s = shape(t);
    const r = (s?.salespersonId as { safeParse: (v: unknown) => { success: boolean } }).safeParse('');
    expect(r.success).toBe(false);
  });

  it('update requiere mappingId positivo', () => {
    const t = findTool('reportia_salesperson_mapping_update');
    const s = shape(t);
    const r = (s?.mappingId as { safeParse: (v: unknown) => { success: boolean } }).safeParse(-1);
    expect(r.success).toBe(false);
  });
});

describe('esquemas - invoices list', () => {
  it('invoices_list exige formato YYYY-MM-DD en startDate', () => {
    const t = findTool('reportia_invoices_list');
    const s = shape(t);
    const ok = (s?.startDate as { safeParse: (v: unknown) => { success: boolean } }).safeParse('2025-01-01');
    const bad = (s?.startDate as { safeParse: (v: unknown) => { success: boolean } }).safeParse('01-01-2025');
    expect(ok.success).toBe(true);
    expect(bad.success).toBe(false);
  });

  it('invoices_list acepta payload vacio (filtros opcionales)', () => {
    const t = findTool('reportia_invoices_list');
    const r = (t!.inputSchema as { safeParse: (v: unknown) => { success: boolean } }).safeParse({});
    expect(r.success).toBe(true);
  });
});

describe('esquemas - invoice settings', () => {
  it('invoice_settings_create acepta settings como record', () => {
    const t = findTool('reportia_invoice_settings_create');
    const r = (t!.inputSchema as { safeParse: (v: unknown) => { success: boolean } }).safeParse({
      settings: { isEnabled: true, title: 'FACTURA' },
    });
    expect(r.success).toBe(true);
  });
});

describe('guard de confirmacion - herramientas destructivas', () => {
  it('salesperson_mapping_delete rechaza sin confirm=true', async () => {
    const t = findTool('reportia_salesperson_mapping_delete');
    const mockClient = {
      call: async () => {
        throw new Error('NO_DEBE_LLAMAR_API');
      },
    };
    const result = await t!.handler(
      { mappingId: 1, confirm: false } as never,
      { client: mockClient as never, defaultCompanyId: 1 },
    );
    expect(result.ok).toBe(false);
    if (result.ok === false) {
      expect(result.error.code).toBe('GUARD_REJECTED');
    }
  });

  it('invoice_email_send rechaza sin confirm=true', async () => {
    const t = findTool('reportia_invoice_email_send');
    const mockClient = {
      call: async () => {
        throw new Error('NO_DEBE_LLAMAR_API');
      },
    };
    const result = await t!.handler(
      { invoiceId: 'F-1-123', email: 'a@b.com', confirm: false } as never,
      { client: mockClient as never, defaultCompanyId: 1 },
    );
    expect(result.ok).toBe(false);
    if (result.ok === false) expect(result.error.code).toBe('GUARD_REJECTED');
  });

  it('invoices_send_multiple rechaza sin confirm=true', async () => {
    const t = findTool('reportia_invoices_send_multiple');
    const mockClient = {
      call: async () => {
        throw new Error('NO_DEBE_LLAMAR_API');
      },
    };
    const result = await t!.handler(
      { invoiceIds: ['F-1-123'], confirm: false } as never,
      { client: mockClient as never, defaultCompanyId: 1 },
    );
    expect(result.ok).toBe(false);
    if (result.ok === false) expect(result.error.code).toBe('GUARD_REJECTED');
  });

  it('invoices_send_multiple valida que invoiceIds no este vacio', () => {
    const t = findTool('reportia_invoices_send_multiple');
    const r = (t!.inputSchema as { safeParse: (v: unknown) => { success: boolean } }).safeParse({
      invoiceIds: [],
      confirm: true,
    });
    expect(r.success).toBe(false);
  });

  it('invoices_send_multiple acepta confirm=true con invoiceIds validos', async () => {
    const t = findTool('reportia_invoices_send_multiple');
    let called = false;
    const mockClient = {
      call: async () => {
        called = true;
        return { success: true, sent: 1, failed: 0 };
      },
    };
    const result = await t!.handler(
      { invoiceIds: ['F-1-123'], confirm: true } as never,
      { client: mockClient as never, defaultCompanyId: 1 },
    );
    expect(called).toBe(true);
    expect(result.ok).toBe(true);
  });

  it('invoice_email_send acepta confirm=true y delega a la API', async () => {
    const t = findTool('reportia_invoice_email_send');
    let calledWith: { method?: string; body?: unknown; query?: unknown } | null = null;
    const mockClient = {
      call: async (_endpoint: string, opts: { method?: string; body?: unknown; query?: unknown }) => {
        calledWith = opts;
        return { success: true };
      },
    };
    const result = await t!.handler(
      { invoiceId: 'F-1-123', email: 'a@b.com', confirm: true } as never,
      { client: mockClient as never, defaultCompanyId: 1 },
    );
    expect(result.ok).toBe(true);
    expect(calledWith?.method).toBe('POST');
    expect(calledWith?.body).toEqual({ email: 'a@b.com' });
  });
});

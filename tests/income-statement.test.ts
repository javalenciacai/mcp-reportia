/**
 * Tool `reportia_income_statement_get` (estado de resultados con procedencia).
 *
 * Casos T3-01…T3-13 y criterios (a)–(l). Usan el servidor real con
 * `InMemoryTransport` y un cliente HTTP falso que registra cada llamada; los
 * casos de errores HTTP (T3-09) y la ruta completa usan además el cliente real
 * contra un servidor HTTP local, para probar el mapeo de verdad. No tocan red
 * externa ni datos reales. Los fixtures son sintéticos.
 */
import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as http from 'node:http';
import type { AddressInfo } from 'node:net';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

import { buildTestConfig } from '../src/config.js';
import { createMcpServer } from '../src/server.js';
import { allTools } from '../src/tools/index.js';
import { MAX_OUTPUT_BYTES, incomeStatementTools } from '../src/tools/income-statement.js';
import { MUTATING_TOOLS, READ_ONLY_TOOLS, SENSITIVE_READ_TOOLS } from '../src/read-only-tools.js';
import type { ReportiaClient } from '../src/client.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TOOL = 'reportia_income_statement_get';
const loadFixture = (f: string) => JSON.parse(fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', f), 'utf8'));
const summaryFixture = () => loadFixture('income-statement.synthetic.json');
const breakdownFixture = () => loadFixture('income-statement-breakdown.synthetic.json');

const PERIOD = { dateFrom: '2026-10-01', dateTo: '2026-10-31' };

// ---------------------------------------------------------------- utilidades

interface Recorded {
  method: string;
  endpoint: string;
  query?: Record<string, unknown>;
}
type Responder = (endpoint: string, options: { method?: string; query?: Record<string, unknown> }) => unknown;

function fakeClient(respond: Responder = () => summaryFixture()) {
  const calls: Recorded[] = [];
  const client = {
    version: 'fake',
    async call(endpoint: string, options: { method?: string; query?: Record<string, unknown> } = {}) {
      calls.push({ method: options.method ?? 'GET', endpoint, query: options.query });
      const r = respond(endpoint, options);
      if (r instanceof Error) throw r;
      return r;
    },
    async download() {
      throw new Error('download no debe usarse');
    },
    async close() {},
    diagnostics() {
      return {} as never;
    },
    invalidateSession() {},
  } as unknown as ReportiaClient;
  return { client, calls };
}

async function connect(overrides: Parameters<typeof buildTestConfig>[0] = {}, respond?: Responder) {
  const fake = fakeClient(respond);
  const server = createMcpServer(buildTestConfig(overrides), fake.client);
  const mcp = new Client({ name: 'test', version: '0.0.0' });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(a), mcp.connect(b)]);
  return { mcp, calls: fake.calls };
}

interface Invoked {
  isError: boolean;
  text: string;
  /** JSON del cuerpo (éxito) o del error de la tool. */
  json: any;
  structured?: Record<string, unknown>;
}

/** Llama a la tool; unifica «error lanzado por el SDK» y «resultado isError». */
async function invoke(mcp: Client, args: Record<string, unknown>): Promise<Invoked> {
  try {
    const r = await mcp.callTool({ name: TOOL, arguments: args });
    const text = (r.content as Array<{ text: string }>)[0]?.text ?? '';
    let json: unknown = undefined;
    try {
      json = JSON.parse(text);
    } catch {
      /* texto libre */
    }
    return { isError: r.isError === true, text, json, structured: r.structuredContent as any };
  } catch (e) {
    return { isError: true, text: e instanceof Error ? e.message : String(e), json: undefined };
  }
}

/** Suma exacta de importes decimales (cadenas) con BigInt: tolerancia 0. */
function parseDecimal(s: string): { n: bigint; scale: number } {
  const m = /^(-?)(\d+)(?:\.(\d+))?$/.exec(s);
  if (!m) throw new Error(`importe no decimal: ${s}`);
  const frac = m[3] ?? '';
  const n = BigInt(m[2] + frac) * (m[1] ? -1n : 1n);
  return { n, scale: frac.length };
}
function sumDecimals(values: string[]): string {
  const parsed = values.map(parseDecimal);
  const scale = Math.max(2, ...parsed.map((p) => p.scale));
  let total = 0n;
  for (const p of parsed) total += p.n * 10n ** BigInt(scale - p.scale);
  const neg = total < 0n;
  const digits = (neg ? -total : total).toString().padStart(scale + 1, '0');
  return `${neg ? '-' : ''}${digits.slice(0, digits.length - scale)}.${digits.slice(digits.length - scale)}`;
}
const sameDecimal = (a: string, b: string) => {
  const x = parseDecimal(a);
  const y = parseDecimal(b);
  const s = Math.max(x.scale, y.scale);
  return x.n * 10n ** BigInt(s - x.scale) === y.n * 10n ** BigInt(s - y.scale);
};

/** Recorre todos los nodos de un árbol `lines`. */
function* walk(node: any): Generator<any> {
  yield node;
  for (const c of node.children ?? []) yield* walk(c);
}

// ---------------------------------------------------------------- (a) T3-01 / T3-12 / (k)

describe('(a) la tool devuelve lo mismo que Reportia, campo a campo y con tolerancia 0', () => {
  it('T3-01: la salida es el fixture + `query` + `warnings`, sin tocar ningún monto', async () => {
    const { mcp } = await connect({ companyId: 7 });
    const r = await invoke(mcp, { ...PERIOD });
    expect(r.isError, r.text).toBe(false);
    const { query, warnings, ...upstream } = r.json;
    expect(upstream).toEqual(summaryFixture());
    expect(Object.keys(r.json).sort()).toEqual([...Object.keys(summaryFixture()), 'query', 'warnings'].sort());
    expect(warnings).toEqual([]);
    expect(query).toMatchObject({ companyId: 7, ...PERIOD, movementsPerAccount: 5 });
    // Los montos siguen siendo cadenas, incluidos los de tres decimales.
    expect(r.json.lines.expense.amount).toBe('12000000.625');
    expect(r.json.lines.expense.children[0].children[0].movements.remainder.debit).toBe('0.125');
    expect(typeof r.json.grossProfit.amount).toBe('string');
    expect(r.json.grossProfit).toEqual({ amount: '154108420.00' });
    // El mismo objeto viaja como contenido estructurado.
    expect(r.structured).toEqual(r.json);
  });

  it('T3-01b: el fixture es coherente con su aritmética (utilidad bruta = ingresos − costos)', () => {
    const f = summaryFixture();
    expect(sumDecimals([f.lines.income.amount, `-${f.lines.cost.amount}`])).toBe(f.grossProfit.amount);
  });

  it('T3-07: un periodo sin movimientos se propaga tal cual (ceros), sin objeto vacío ni datos añadidos', async () => {
    const zero = (key: string, label: string, resultClass: string) => ({
      key, label, resultClass, leaf: false, debit: '0.00', credit: '0.00', amount: '0.00', movementCount: 0,
      provenance: { filter: { accountPrefix: key, ...PERIOD, excluded: ['voided'] } },
      children: [],
    });
    const empty = {
      ...summaryFixture(),
      lines: {
        income: zero('4', 'Ingresos (cuentas 4*)', 'income'),
        cost: zero('6', 'Costos (cuentas 6*)', 'cost'),
        expense: zero('5', 'Gastos (cuentas 5*)', 'expense'),
      },
      grossProfit: { amount: '0.00' },
      unclassified: [],
      dataQuality: {
        voided: { count: 0, debit: '0.00', credit: '0.00' },
        invalidValue: { count: 0 },
        invalidDirection: { count: 0, amount: '0.00' },
        withoutDate: { count: 0 },
      },
      rowBudget: { limit: 500, used: 0, truncated: false },
    };
    const { mcp } = await connect({ companyId: 7 }, () => empty);
    const r = await invoke(mcp, { ...PERIOD });
    expect(r.isError, r.text).toBe(false);
    const { query: _q, warnings: _w, ...upstream } = r.json;
    expect(upstream).toEqual(empty);
    expect(r.json.lines.income.children).toEqual([]);
    expect(r.json.unclassified).toEqual([]);
  });

  it('T3-12: `unclassified` y `dataQuality` salen tal cual; la clase 7 no entra en `lines` ni en la utilidad bruta', async () => {
    const { mcp } = await connect({ companyId: 7 });
    const r = await invoke(mcp, { ...PERIOD });
    expect(r.json.unclassified).toEqual(summaryFixture().unclassified);
    expect(r.json.unclassified.map((u: any) => u.key)).toEqual(['730505']);
    expect(Object.keys(r.json.dataQuality).sort()).toEqual(['invalidDirection', 'invalidValue', 'voided', 'withoutDate']);
    expect(r.json.dataQuality).toEqual(summaryFixture().dataQuality);
    expect(r.json.dataQuality.withoutDate).toEqual({ count: 1 });
    const nodes = Object.values(r.json.lines).flatMap((n) => [...walk(n)]);
    expect(nodes.map((n: any) => n.key)).not.toContain('730505');
    for (const u of r.json.unclassified) {
      for (const n of nodes) {
        expect(n.amount).not.toBe(u.debit);
        expect(n.debit).not.toBe(u.debit);
      }
    }
  });

  it('(k): `company.id` sale tal cual lo devuelve Reportia, aunque difiera de la empresa pedida', async () => {
    const upstream = { ...summaryFixture(), company: { id: 1 } };
    const { mcp, calls } = await connect({ companyId: 7 }, () => upstream);
    const r = await invoke(mcp, { ...PERIOD });
    expect(calls[0]?.endpoint).toBe('/api/companies/7/reports/income-statement');
    expect(r.json.company).toEqual({ id: 1 });
    expect(r.json.query.companyId).toBe(7);
  });
});

// ---------------------------------------------------------------- (b) T3-02 / T3-03

describe('(b) procedencia de cada total y desglose exacto', () => {
  it('T3-02: cada nodo trae provenance.filter y movementCount; las hojas con filas cuadran shownCount + remainder = totalCount', async () => {
    const { mcp } = await connect({ companyId: 7 });
    const r = await invoke(mcp, { ...PERIOD });
    const nodes = Object.values(r.json.lines).flatMap((n) => [...walk(n)]);
    expect(nodes.length).toBeGreaterThan(8);
    for (const n of nodes) {
      expect(n.provenance?.filter, n.key).toBeTypeOf('object');
      expect(n.provenance.filter).not.toHaveProperty('kind');
      expect(Number.isInteger(n.movementCount), n.key).toBe(true);
    }
    const leaves = nodes.filter((n) => n.leaf);
    expect(leaves.map((l) => l.key)).toEqual(['413505', '417505', '613505', '520505']);
    for (const l of leaves) {
      expect(l.movements.shownCount + l.movements.remainder.count).toBe(l.movements.totalCount);
      expect(l.movements.rows).toHaveLength(l.movements.shownCount);
    }
  });

  it('T3-02b: `movementsPerAccount` se envía SIEMPRE explícito, por defecto 5; 0 y 50 se respetan; fuera de 0–50 se rechaza', async () => {
    const { mcp, calls } = await connect({ companyId: 7 });
    await invoke(mcp, { ...PERIOD });
    await invoke(mcp, { ...PERIOD, movementsPerAccount: 0 });
    await invoke(mcp, { ...PERIOD, movementsPerAccount: 50 });
    expect(calls.map((c) => c.query?.movementsPerAccount)).toEqual([5, 0, 50]);
    for (const bad of [51, -1, 1.5, '5']) {
      const before = calls.length;
      const r = await invoke(mcp, { ...PERIOD, movementsPerAccount: bad });
      expect(r.isError, String(bad)).toBe(true);
      expect(calls).toHaveLength(before);
    }
  });

  it('T3-03: el desglose paginado (limit 3, cruzando bordes de página) suma exactamente los totales del conjunto completo', async () => {
    // Reportia simulado: 8 filas de la cuenta 520505, con importes de 2 y 3 decimales.
    const rows = [
      ['D', '12000000.50'], ['D', '0.125'], ['C', '300.10'], ['D', '9.999'], ['C', '0.001'], ['D', '1.00'],
      ['C', '2500000.25'], ['D', '41.875'],
    ].map(([direction, amount], i) => ({
      id: 2000 + i, date: `2026-10-${String(i + 1).padStart(2, '0')}`,
      document: { type: 'E', code: 'CE', number: String(i + 1).padStart(4, '0') },
      account: '520505', accountName: null, description: `Fila ${i + 1}`,
      third: { nit: '900000002', name: null }, direction, amount,
    }));
    const debit = sumDecimals(rows.filter((r) => r.direction === 'D').map((r) => r.amount));
    const credit = sumDecimals(rows.filter((r) => r.direction === 'C').map((r) => r.amount));
    const upstream = (_e: string, o: { query?: Record<string, unknown> }) => {
      const limit = Number(o.query?.limit);
      const offset = Number(o.query?.offset);
      const page = rows.slice(offset, offset + limit);
      return {
        ...breakdownFixture(),
        totals: { count: rows.length, debit, credit },
        page: { limit, offset, returned: page.length, hasMore: offset + page.length < rows.length },
        rows: page,
      };
    };
    const { mcp, calls } = await connect({ companyId: 7 }, upstream);
    const seen: any[] = [];
    let offset = 0;
    let last: any;
    for (let guard = 0; guard < 10; guard++) {
      const r = await invoke(mcp, { ...PERIOD, account: '520505', limit: 3, offset });
      expect(r.isError, r.text).toBe(false);
      last = r.json;
      seen.push(...r.json.rows);
      if (!r.json.page.hasMore) break;
      offset += r.json.page.returned;
    }
    expect(calls).toHaveLength(3); // 3 + 3 + 2 filas
    expect(calls.every((c) => c.endpoint === '/api/companies/7/reports/account-aggregates/movements')).toBe(true);
    expect(calls.map((c) => c.query?.offset)).toEqual([0, 3, 6]);
    expect(seen).toHaveLength(8);
    expect(last.totals.count).toBe(seen.length);
    expect(sumDecimals(seen.filter((r) => r.direction === 'D').map((r) => r.amount))).toBe(last.totals.debit);
    expect(sumDecimals(seen.filter((r) => r.direction === 'C').map((r) => r.amount))).toBe(last.totals.credit);
    expect(last.totals.debit).toBe('12000053.499');
    expect(last.totals.credit).toBe('2500300.351');
  });

  it('T3-03b: el desglose de referencia (limit 1, offset 1) se propaga idéntico; la tool traduce `account` a `lineKey`', async () => {
    const { mcp, calls } = await connect({ companyId: 7 }, () => breakdownFixture());
    const r = await invoke(mcp, { ...PERIOD, account: '520505', limit: 1, offset: 1 });
    expect(r.isError, r.text).toBe(false);
    const { query, warnings, ...upstream } = r.json;
    expect(upstream).toEqual(breakdownFixture());
    expect(query).toMatchObject({ account: '520505', limit: 1, offset: 1 });
    expect(calls).toEqual([
      {
        method: 'GET',
        endpoint: '/api/companies/7/reports/account-aggregates/movements',
        query: { lineKey: '520505', ...PERIOD, limit: 1, offset: 1 },
      },
    ]);
  });

  it('T3-03c: en el desglose, límite 100 y offset 0 por defecto; `limit` 1–1000 y `account` solo dígitos (1–10)', async () => {
    const { mcp, calls } = await connect({ companyId: 7 }, () => breakdownFixture());
    await invoke(mcp, { ...PERIOD, account: '52' });
    expect(calls[0]?.query).toEqual({ lineKey: '52', ...PERIOD, limit: 100, offset: 0 });
    for (const bad of [{ limit: 0 }, { limit: 1001 }, { offset: -1 }, { account: '52 05' }, { account: '' }, { account: '12345678901' }]) {
      const before = calls.length;
      const r = await invoke(mcp, { ...PERIOD, account: '52', ...bad });
      expect(r.isError, JSON.stringify(bad)).toBe(true);
      expect(calls).toHaveLength(before);
    }
  });

  it('T3-03d: `limit`/`offset` sin `account` no viajan a Reportia y la tool lo avisa en `warnings`', async () => {
    const { mcp, calls } = await connect({ companyId: 7 });
    const r = await invoke(mcp, { ...PERIOD, limit: 10 });
    expect(calls[0]?.query).toEqual({ ...PERIOD, movementsPerAccount: 5 });
    expect(r.json.warnings).toHaveLength(1);
    expect(r.json.warnings[0].code).toBe('PARAM_IGNORED');
  });
});

// ---------------------------------------------------------------- (g)–(j) T3-04 / T3-05

describe('(g)–(j) empresa: input ?? REPORTIA_COMPANY_ID; candado solo con el perfil de solo lectura', () => {
  it('(g)/T3-05: sin variable y con companyId 7: UNA llamada a /api/companies/7/reports/income-statement sin companyId en la consulta', async () => {
    const { mcp, calls } = await connect({ companyId: undefined });
    const r = await invoke(mcp, { ...PERIOD, companyId: 7 });
    expect(r.isError, r.text).toBe(false);
    expect(calls).toEqual([
      { method: 'GET', endpoint: '/api/companies/7/reports/income-statement', query: { ...PERIOD, movementsPerAccount: 5 } },
    ]);
    expect(calls[0]?.query).not.toHaveProperty('companyId');
  });

  it('T3-05b: con la variable en 7 y sin input, la ruta es /api/companies/7/…', async () => {
    const { mcp, calls } = await connect({ companyId: 7 });
    await invoke(mcp, { ...PERIOD });
    expect(calls.map((c) => c.endpoint)).toEqual(['/api/companies/7/reports/income-statement']);
  });

  it('(h)/T3-05c: sin variable y sin input => MISSING_COMPANY_ID con 0 llamadas HTTP', async () => {
    const { mcp, calls } = await connect({ companyId: undefined });
    const r = await invoke(mcp, { ...PERIOD });
    expect(r.isError).toBe(true);
    expect(r.json.code).toBe('MISSING_COMPANY_ID');
    expect(calls).toHaveLength(0);
  });

  it('(i)/T3-04b: con la variable en 7 y SIN flag, companyId 9 usa 9 (como el resto de las tools)', async () => {
    const { mcp, calls } = await connect({ companyId: 7 });
    const r = await invoke(mcp, { ...PERIOD, companyId: 9 });
    expect(r.isError, r.text).toBe(false);
    expect(calls.map((c) => c.endpoint)).toEqual(['/api/companies/9/reports/income-statement']);
    expect(calls[0]?.query).not.toHaveProperty('companyId');
  });

  it('(j)/T3-04: con REPORTIA_READ_ONLY=true y la variable en 7, companyId 9 => COMPANY_MISMATCH con 0 llamadas; 7 u omitido pasan', async () => {
    const { mcp, calls } = await connect({ readOnly: true, companyId: 7 });
    const bad = await invoke(mcp, { ...PERIOD, companyId: 9 });
    expect(bad.isError).toBe(true);
    expect(bad.json.code).toBe('COMPANY_MISMATCH');
    expect(calls).toHaveLength(0);
    for (const extra of [{ companyId: 7 }, {}]) {
      const ok = await invoke(mcp, { ...PERIOD, ...extra });
      expect(ok.isError, ok.text).toBe(false);
    }
    expect(calls.map((c) => c.endpoint)).toEqual([
      '/api/companies/7/reports/income-statement',
      '/api/companies/7/reports/income-statement',
    ]);
    expect(calls.every((c) => !('companyId' in (c.query ?? {})))).toBe(true);
  });

  it('(j)b: el candado cubre también el modo desglose', async () => {
    const { mcp, calls } = await connect({ readOnly: true, companyId: 7 }, () => breakdownFixture());
    const bad = await invoke(mcp, { ...PERIOD, account: '520505', companyId: 9 });
    expect(bad.json.code).toBe('COMPANY_MISMATCH');
    expect(calls).toHaveLength(0);
  });

  it('T3-04c (regresión transporte): `signal`, `sessionId` y `_meta` junto a un periodo válido se aceptan', async () => {
    const { mcp, calls } = await connect({ companyId: 7 });
    const r = await invoke(mcp, { ...PERIOD, signal: {}, sessionId: 'sesion-1', _meta: { progressToken: 1 } });
    expect(r.isError, r.text).toBe(false);
    expect(calls).toHaveLength(1);
    // Y el esquema los declara (con .strict() serían `unrecognized_keys`).
    const tool = incomeStatementTools[0]!;
    const parsed = tool.inputSchema.safeParse({ ...PERIOD, signal: {}, sessionId: 's', _meta: {} });
    expect(parsed.success).toBe(true);
    // Estricto frente a claves desconocidas al parsear directamente.
    expect(tool.inputSchema.safeParse({ ...PERIOD, startDate: '2026-10-01' }).success).toBe(false);
  });

  it('T3-04e: una clave desconocida con argumentos válidos => INVALID_INPUT y 0 llamadas HTTP', async () => {
    const { mcp, calls } = await connect({ companyId: 7 });
    for (const extra of [{ startDate: '2026-10-01' }, { foo: 1 }, { accountPrefix: '4' }]) {
      const r = await invoke(mcp, { ...PERIOD, ...extra });
      expect(r.isError, r.text).toBe(true);
      expect(r.json.code).toBe('INVALID_INPUT');
    }
    expect(calls).toHaveLength(0);
    // `signal`, `sessionId` y `_meta` siguen aceptándose (T3-04c).
    const ok = await invoke(mcp, { ...PERIOD, signal: {}, sessionId: 's', _meta: {} });
    expect(ok.isError, ok.text).toBe(false);
    expect(calls).toHaveLength(1);
  });

  it('T3-04f: el cambio no alcanza a las otras herramientas (siguen descartando claves desconocidas)', () => {
    const others = allTools.filter((t) => t.name !== TOOL);
    expect(others.length).toBeGreaterThan(60);
    expect(others.every((t) => t.registerSchema === undefined)).toBe(true);
  });

  it('T3-04d: `startDate`/`endDate` (convención antigua) no sustituyen a dateFrom/dateTo', async () => {
    const { mcp, calls } = await connect({ companyId: 7 });
    const r = await invoke(mcp, { startDate: '2026-10-01', endDate: '2026-10-31' });
    expect(r.isError).toBe(true);
    expect(calls).toHaveLength(0);
  });
});

// ---------------------------------------------------------------- (e) T3-06

describe('(e) periodo inválido, invertido, incompleto o con otro formato => error explícito sin llamada HTTP', () => {
  it.each([
    ['fecha imposible 2026-02-30', { dateFrom: '2026-02-30', dateTo: '2026-03-31' }],
    ['mes 13', { dateFrom: '2026-13-01', dateTo: '2026-12-31' }],
    ['dateTo imposible', { dateFrom: '2026-01-01', dateTo: '2026-02-30' }],
    ['falta dateTo', { dateFrom: '2026-10-01' }],
    ['falta dateFrom', { dateTo: '2026-10-31' }],
    ['formato dd/mm/aaaa', { dateFrom: '01/10/2026', dateTo: '31/10/2026' }],
    ['cadenas vacías', { dateFrom: '', dateTo: '' }],
    ['con hora', { dateFrom: '2026-10-01T00:00:00Z', dateTo: '2026-10-31' }],
  ])('T3-06: %s', async (_label, args) => {
    const { mcp, calls } = await connect({ companyId: 7 });
    const r = await invoke(mcp, args);
    expect(r.isError).toBe(true);
    expect(calls).toHaveLength(0);
    // Nunca un agregado vacío disfrazado de éxito.
    expect(r.json?.lines).toBeUndefined();
  });

  it('T3-06b: dateTo < dateFrom => INVALID_DATE_RANGE, sin llamada; el mismo día es válido', async () => {
    const { mcp, calls } = await connect({ companyId: 7 });
    const r = await invoke(mcp, { dateFrom: '2026-10-31', dateTo: '2026-10-01' });
    expect(r.isError).toBe(true);
    expect(r.json.code).toBe('INVALID_DATE_RANGE');
    expect(calls).toHaveLength(0);
    const same = await invoke(mcp, { dateFrom: '2026-10-15', dateTo: '2026-10-15' });
    expect(same.isError, same.text).toBe(false);
    expect(calls).toHaveLength(1);
  });
});

// ---------------------------------------------------------------- (f) T3-08

describe('(f) una sola capa de truncado (la de Reportia) y red de seguridad OUTPUT_TOO_LARGE', () => {
  const padded = (bytes: number) => {
    const f = summaryFixture();
    f.lines.income.children[0].children[0].movements.rows[0].description = 'x'.repeat(bytes);
    return f;
  };

  it('T3-08: una respuesta que supera MAX_OUTPUT_BYTES => OUTPUT_TOO_LARGE, sin datos parciales y con la indicación de bajar movementsPerAccount', async () => {
    expect(MAX_OUTPUT_BYTES).toBe(2 * 1024 * 1024);
    const { mcp } = await connect({ companyId: 7 }, () => padded(2.5 * 1024 * 1024));
    const r = await invoke(mcp, { ...PERIOD });
    expect(r.isError).toBe(true);
    expect(r.json.code).toBe('OUTPUT_TOO_LARGE');
    expect(r.json.message).toMatch(/movementsPerAccount/);
    expect(r.text.length).toBeLessThan(2000);
    expect(r.text).not.toContain('xxxxxxxx');
    expect(r.json.lines).toBeUndefined();
    expect(r.json.details).toMatchObject({ maxBytes: MAX_OUTPUT_BYTES });
  });

  it('T3-08b: el borde: exactamente MAX_OUTPUT_BYTES pasa; un byte más falla', async () => {
    let pad = 0;
    const { mcp } = await connect({ companyId: 7 }, () => padded(pad));
    const base = await invoke(mcp, { ...PERIOD });
    expect(base.isError).toBe(false);
    const baseBytes = Buffer.byteLength(base.text, 'utf8');
    pad = MAX_OUTPUT_BYTES - baseBytes;
    const atLimit = await invoke(mcp, { ...PERIOD });
    expect(atLimit.isError, atLimit.text.slice(0, 200)).toBe(false);
    expect(Buffer.byteLength(atLimit.text, 'utf8')).toBe(MAX_OUTPUT_BYTES);
    pad += 1;
    const over = await invoke(mcp, { ...PERIOD });
    expect(over.isError).toBe(true);
    expect(over.json.code).toBe('OUTPUT_TOO_LARGE');
  });

  it('T3-08c: el desglose también tiene la red de seguridad y sugiere bajar `limit`', async () => {
    const big = breakdownFixture();
    big.rows[0].description = 'y'.repeat(2.5 * 1024 * 1024);
    const { mcp } = await connect({ companyId: 7 }, () => big);
    const r = await invoke(mcp, { ...PERIOD, account: '520505' });
    expect(r.json.code).toBe('OUTPUT_TOO_LARGE');
    expect(r.json.message).toMatch(/limit/);
  });

  it('T3-08d: el recorte de Reportia (remainder.count > 0, rowBudget.truncated) pasa INTACTO: el MCP no agrega ni quita filas', async () => {
    const cut = summaryFixture();
    cut.rowBudget = { limit: 500, used: 500, truncated: true };
    const leaf = cut.lines.expense.children[0].children[0];
    leaf.movements.truncatedByBudget = true;
    leaf.movements.shownCount = 0;
    leaf.movements.rows = [];
    leaf.movements.remainder = { count: 2, debit: '12000000.625', credit: '0.00' };
    const { mcp } = await connect({ companyId: 7 }, () => cut);
    const r = await invoke(mcp, { ...PERIOD });
    expect(r.isError, r.text).toBe(false);
    const { query: _q, warnings: _w, ...upstream } = r.json;
    expect(upstream).toEqual(cut);
    expect(r.json.rowBudget.truncated).toBe(true);
    expect(r.json.lines.expense.children[0].children[0].movements.rows).toEqual([]);
  });
});

// ---------------------------------------------------------------- (a) T3-13

describe('(a) validación no estricta del upstream => UPSTREAM_CONTRACT_MISMATCH solo ante lo que el contrato exige', () => {
  const mutateSummary = (fn: (f: any) => void) => () => {
    const f = summaryFixture();
    fn(f);
    return f;
  };

  it.each([
    ['falta schemaVersion', mutateSummary((f) => delete f.schemaVersion)],
    ['schemaVersion desconocida (2)', mutateSummary((f) => (f.schemaVersion = 2))],
    ['schemaVersion como cadena', mutateSummary((f) => (f.schemaVersion = '1'))],
    ['falta company', mutateSummary((f) => delete f.company)],
    ['company.id como cadena', mutateSummary((f) => (f.company.id = '1'))],
    ['falta period', mutateSummary((f) => delete f.period)],
    ['falta generatedAt', mutateSummary((f) => delete f.generatedAt)],
    ['falta lines', mutateSummary((f) => delete f.lines)],
    ['falta lines.cost', mutateSummary((f) => delete f.lines.cost)],
    ['grossProfit aplanado a cadena', mutateSummary((f) => (f.grossProfit = '154108420.00'))],
    ['grossProfit.amount como número', mutateSummary((f) => (f.grossProfit.amount = 154108420))],
    ['falta unclassified', mutateSummary((f) => delete f.unclassified)],
    ['falta definition', mutateSummary((f) => delete f.definition)],
    ['falta definition.version', mutateSummary((f) => delete f.definition.version)],
    ['falta dataQuality', mutateSummary((f) => delete f.dataQuality)],
    ['dataQuality sin withoutDate', mutateSummary((f) => delete f.dataQuality.withoutDate)],
    ['falta rowBudget', mutateSummary((f) => delete f.rowBudget)],
    ['monto de un nodo como número', mutateSummary((f) => (f.lines.expense.amount = 12000000.625))],
    ['monto con formato no decimal', mutateSummary((f) => (f.lines.income.debit = '1,000.00'))],
    ['leaf como cadena', mutateSummary((f) => (f.lines.income.leaf = 'false'))],
    ['resultClass desconocida', mutateSummary((f) => (f.lines.income.resultClass = 'revenue'))],
    ['nodo sin provenance', mutateSummary((f) => delete f.lines.income.children[0].provenance)],
    ['nodo sin movementCount', mutateSummary((f) => delete f.lines.cost.movementCount)],
    ['hoja: movements sin remainder', mutateSummary((f) => delete f.lines.expense.children[0].children[0].movements.remainder)],
    ['fila con direction inválida', mutateSummary((f) => (f.lines.income.children[0].children[0].movements.rows[0].direction = 'X'))],
    ['fila con amount numérico', mutateSummary((f) => (f.lines.income.children[0].children[0].movements.rows[0].amount = 400000000))],
    ['fila sin third', mutateSummary((f) => delete f.lines.income.children[0].children[0].movements.rows[0].third)],
    ['raíz de ingresos sin accountPrefix en provenance.filter', mutateSummary((f) => delete f.lines.income.provenance.filter.accountPrefix)],
    ['raíz de ingresos con provenance.filter vacío', mutateSummary((f) => (f.lines.income.provenance.filter = {}))],
    ['agregado con selector account en vez de accountPrefix', mutateSummary((f) => {
      const flt = f.lines.income.children[0].provenance.filter;
      flt.account = flt.accountPrefix;
      delete flt.accountPrefix;
    })],
    ['hoja sin account en provenance.filter', mutateSummary((f) => delete f.lines.income.children[0].children[0].provenance.filter.account)],
    ['provenance.filter sin dateFrom', mutateSummary((f) => delete f.lines.cost.provenance.filter.dateFrom)],
    ['provenance.filter sin excluded', mutateSummary((f) => delete f.lines.cost.provenance.filter.excluded)],
    ['agregado con movimientos y sin children (raíz)', mutateSummary((f) => delete f.lines.income.children)],
    ['agregado con movimientos y sin children (grupo)', mutateSummary((f) => delete f.lines.income.children[0].children)],
    ['unclassified sin selector account', mutateSummary((f) => delete f.unclassified[0].provenance.filter.account)],
    ['respuesta vacía', () => null],
    ['respuesta que no es objeto', () => 'ok'],
  ])('T3-13: %s', async (_label, respond) => {
    const { mcp, calls } = await connect({ companyId: 7 }, respond as Responder);
    const r = await invoke(mcp, { ...PERIOD });
    expect(r.isError).toBe(true);
    expect(r.json.code).toBe('UPSTREAM_CONTRACT_MISMATCH');
    expect(calls).toHaveLength(1);
    expect(r.json.lines).toBeUndefined();
  });

  it.each([
    ['falta totals', (f: any) => delete f.totals],
    ['falta page.hasMore', (f: any) => delete f.page.hasMore],
    ['falta lineKey', (f: any) => delete f.lineKey],
    ['rows no es arreglo', (f: any) => (f.rows = {})],
    ['totals.debit como número', (f: any) => (f.totals.debit = 12000000.625)],
    ['schemaVersion desconocida', (f: any) => (f.schemaVersion = 7)],
    ['fila sin id', (f: any) => delete f.rows[0].id],
  ])('T3-13b (desglose): %s', async (_label, fn) => {
    const f = breakdownFixture();
    fn(f);
    const { mcp } = await connect({ companyId: 7 }, () => f);
    const r = await invoke(mcp, { ...PERIOD, account: '520505' });
    expect(r.json.code).toBe('UPSTREAM_CONTRACT_MISMATCH');
  });

  it('T3-13d: un agregado con children vacío y una cuenta SIN código (account: null) en unclassified siguen siendo válidos', async () => {
    const f = summaryFixture();
    f.lines.cost.children = [];
    f.unclassified.push({
      key: 'SIN_CODIGO', debit: '0.00', credit: '0.00', movementCount: 0,
      provenance: { filter: { account: null, ...PERIOD, excluded: ['voided'] } },
    });
    const { mcp } = await connect({ companyId: 7 }, () => f);
    const r = await invoke(mcp, { ...PERIOD });
    expect(r.isError, r.text).toBe(false);
  });

  it('T3-13e: `unclassified[]` con claves `41A` y `4A` y `account: null` pasa intacta y no genera ninguna petición de desglose por esa clave', async () => {
    const f = summaryFixture();
    for (const key of ['41A', '4A']) {
      f.unclassified.push({
        key, debit: '0.00', credit: '0.00', movementCount: 0,
        provenance: { filter: { account: null, ...PERIOD, excluded: ['voided'] } },
      });
    }
    const { mcp, calls } = await connect({ companyId: 7 }, () => f);
    const r = await invoke(mcp, { ...PERIOD });
    expect(r.isError, r.text).toBe(false);
    const { query: _q, warnings: _w, ...upstream } = r.json;
    expect(upstream).toEqual(f);
    expect(r.json.unclassified.map((u: any) => u.key)).toEqual(expect.arrayContaining(['41A', '4A']));
    // Una sola petición (el resumen): ninguna por `41A` ni por `4A`.
    expect(calls).toHaveLength(1);
    expect(JSON.stringify(calls)).not.toMatch(/41A|4A/);
  });

  it('T3-13f: una hoja del árbol `lines` con `provenance.filter.account: null` sigue siendo UPSTREAM_CONTRACT_MISMATCH', async () => {
    const { mcp, calls } = await connect({ companyId: 7 }, mutateSummary((f) => {
      f.lines.income.children[0].children[0].provenance.filter.account = null;
    }) as Responder);
    const r = await invoke(mcp, { ...PERIOD });
    expect(r.isError).toBe(true);
    expect(r.json.code).toBe('UPSTREAM_CONTRACT_MISMATCH');
    expect(calls).toHaveLength(1);
    expect(r.json.lines).toBeUndefined();
  });

  it('T3-13c: un campo ADICIONAL no previsto no falla y se propaga (nivel superior, nodo, fila, bloque de datos)', async () => {
    const f = summaryFixture();
    f.nuevoCampoSuperior = { a: 1 };
    f.lines.income.campoNuevoNodo = 'x';
    f.lines.income.children[0].children[0].movements.rows[0].campoNuevoFila = 42;
    f.dataQuality.otraMetrica = { count: 3 };
    f.rowBudget.extra = true;
    const { mcp } = await connect({ companyId: 7 }, () => f);
    const r = await invoke(mcp, { ...PERIOD });
    expect(r.isError, r.text).toBe(false);
    const { query: _q, warnings: _w, ...upstream } = r.json;
    expect(upstream).toEqual(f);
    expect(r.json.nuevoCampoSuperior).toEqual({ a: 1 });
  });
});

// ---------------------------------------------------------------- (c)/(e) T3-09 con HTTP real

interface HitInfo {
  method: string;
  url: string;
}

async function withHttp(
  handler: (req: http.IncomingMessage, res: http.ServerResponse) => void,
  run: (baseUrl: string, hits: HitInfo[]) => Promise<void>,
) {
  const hits: HitInfo[] = [];
  const server = http.createServer((req, res) => {
    hits.push({ method: req.method ?? '', url: req.url ?? '' });
    handler(req, res);
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address() as AddressInfo;
  try {
    await run(`http://127.0.0.1:${port}`, hits);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((r) => server.close(() => r()));
  }
}
const json = (res: http.ServerResponse, status: number, body: unknown) => {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
};
async function connectReal(baseUrl: string, overrides: Parameters<typeof buildTestConfig>[0] = {}) {
  const server = createMcpServer(buildTestConfig({ baseUrl, companyId: 7, timeoutMs: 1500, ...overrides }));
  const mcp = new Client({ name: 'test', version: '0.0.0' });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(a), mcp.connect(b)]);
  return mcp;
}

describe('cliente real contra un servidor HTTP local', () => {
  it('T3-01c: la ruta completa envía GET /api/companies/7/reports/income-statement con dateFrom, dateTo y movementsPerAccount=5, sin companyId, y devuelve el fixture', async () => {
    await withHttp((_q, res) => json(res, 200, summaryFixture()), async (base, hits) => {
      const mcp = await connectReal(base);
      const r = await invoke(mcp, { ...PERIOD });
      expect(r.isError, r.text).toBe(false);
      expect(hits).toHaveLength(1);
      expect(hits[0]).toEqual({
        method: 'GET',
        url: '/api/companies/7/reports/income-statement?dateFrom=2026-10-01&dateTo=2026-10-31&movementsPerAccount=5',
      });
      const { query: _q, warnings: _w, ...upstream } = r.json;
      expect(upstream).toEqual(summaryFixture());
    });
  });

  it('T3-03e: la ruta del desglose envía lineKey, dateFrom, dateTo, limit y offset', async () => {
    await withHttp((_q, res) => json(res, 200, breakdownFixture()), async (base, hits) => {
      const mcp = await connectReal(base);
      const r = await invoke(mcp, { ...PERIOD, account: '520505', limit: 1, offset: 1 });
      expect(r.isError, r.text).toBe(false);
      expect(hits).toEqual([
        {
          method: 'GET',
          url: '/api/companies/7/reports/account-aggregates/movements?lineKey=520505&dateFrom=2026-10-01&dateTo=2026-10-31&limit=1&offset=1',
        },
      ]);
    });
  });

  describe('T3-09: mapeo de errores del contrato, sin reintentos y sin agregado parcial', () => {
    const cases: Array<[string, number, Record<string, unknown>, string, string | undefined]> = [
      ['401 UNAUTHENTICATED => AUTH_ERROR', 401, { code: 'UNAUTHENTICATED', message: 'Sin sesión' }, 'AUTH_ERROR', 'UNAUTHENTICATED'],
      ['404 COMPANY_NOT_ACCESSIBLE => NOT_FOUND con details.upstreamCode', 404, { code: 'COMPANY_NOT_ACCESSIBLE', message: 'Sin acceso' }, 'NOT_FOUND', 'COMPANY_NOT_ACCESSIBLE'],
      ['400 INVALID_QUERY => INVALID_INPUT', 400, { code: 'INVALID_QUERY', message: 'Consulta inválida', issues: [{ path: ['dateFrom'] }] }, 'INVALID_INPUT', 'INVALID_QUERY'],
      ['429 RATE_LIMIT_EXCEEDED => RATE_LIMITED', 429, { code: 'RATE_LIMIT_EXCEEDED', message: 'Demasiadas peticiones' }, 'RATE_LIMITED', 'RATE_LIMIT_EXCEEDED'],
      ['500 INTERNAL_ERROR => UNEXPECTED', 500, { code: 'INTERNAL_ERROR', message: 'Error interno' }, 'UNEXPECTED', 'INTERNAL_ERROR'],
      ['502 sin cuerpo JSON => UNEXPECTED', 502, {}, 'UNEXPECTED', undefined],
    ];
    it.each(cases)('%s', async (_label, status, body, expectedCode, upstreamCode) => {
      await withHttp((_q, res) => (Object.keys(body).length ? json(res, status, body) : (res.writeHead(status), res.end('bad gateway'))), async (base, hits) => {
        const mcp = await connectReal(base);
        const r = await invoke(mcp, { ...PERIOD });
        expect(r.isError).toBe(true);
        expect(r.json.code).toBe(expectedCode);
        expect(r.json.details?.upstreamCode).toBe(upstreamCode);
        expect(r.json.lines).toBeUndefined();
        expect(hits).toHaveLength(1); // una sola llamada: el MCP no reintenta
      });
    });

    it('el 404 propaga el código de Reportia sin reescribirlo y el 400 conserva `issues`', async () => {
      await withHttp((_q, res) => json(res, 400, { code: 'INVALID_QUERY', message: 'm', issues: [{ path: ['dateFrom'], message: 'inválida' }] }), async (base) => {
        const mcp = await connectReal(base);
        const r = await invoke(mcp, { ...PERIOD });
        expect(r.json.details.issues).toEqual([{ path: ['dateFrom'], message: 'inválida' }]);
        expect(r.json.details.upstreamStatus).toBe(400);
      });
    });

    it('red caída => NETWORK_ERROR', async () => {
      const mcp = await connectReal('http://127.0.0.1:1');
      const r = await invoke(mcp, { ...PERIOD });
      expect(r.isError).toBe(true);
      expect(r.json.code).toBe('NETWORK_ERROR');
    });

    it('demora => TIMEOUT', async () => {
      await withHttp(() => {
        /* nunca responde */
      }, async (base, hits) => {
        const mcp = await connectReal(base, { timeoutMs: 150 });
        const r = await invoke(mcp, { ...PERIOD });
        expect(r.isError).toBe(true);
        expect(r.json.code).toBe('TIMEOUT');
        expect(hits).toHaveLength(1);
      });
    });
  });
});

// ---------------------------------------------------------------- (d) (l) T3-10 / T3-11

describe('(d)/(l) clasificación: la tool es de solo lectura y entra en el perfil', () => {
  it('T3-10/(l): con readOnly tools/list = 38 y contiene la tool; sin flag, 67; la tool está en READ_ONLY_TOOLS y en read-only-tools.json', async () => {
    const withFlag = await connect({ readOnly: true, companyId: 7 });
    const listedRO = (await withFlag.mcp.listTools()).tools.map((t) => t.name);
    expect(listedRO).toHaveLength(38);
    expect(listedRO).toContain(TOOL);
    const without = await connect({ companyId: 7 });
    const listed = (await without.mcp.listTools()).tools.map((t) => t.name);
    expect(listed).toHaveLength(67);
    expect(listed).toContain(TOOL);
    expect(READ_ONLY_TOOLS).toContain(TOOL);
    expect(READ_ONLY_TOOLS).toHaveLength(38);
    expect(MUTATING_TOOLS).not.toContain(TOOL);
    expect(SENSITIVE_READ_TOOLS).not.toContain(TOOL);
    const artifact = JSON.parse(fs.readFileSync(path.join(ROOT, 'read-only-tools.json'), 'utf8'));
    expect(artifact.tools).toContain(TOOL);
    expect(artifact.tools).toHaveLength(38);
    // Exhaustividad: 67 = 38 + 3 + 26, y la tool está registrada una sola vez.
    expect(allTools.map((t) => t.name).filter((n) => n === TOOL)).toHaveLength(1);
    expect(READ_ONLY_TOOLS.length + SENSITIVE_READ_TOOLS.length + MUTATING_TOOLS.length).toBe(67);
  });

  it('T3-11/(d): en todos sus modos el cliente solo ve GET', async () => {
    const { mcp, calls } = await connect({ companyId: 7 }, (endpoint) => (endpoint.endsWith('/movements') ? breakdownFixture() : summaryFixture()));
    await invoke(mcp, { ...PERIOD });
    await invoke(mcp, { ...PERIOD, movementsPerAccount: 0 });
    await invoke(mcp, { ...PERIOD, companyId: 9 });
    await invoke(mcp, { ...PERIOD, account: '520505' });
    await invoke(mcp, { ...PERIOD, account: '52', limit: 1000, offset: 5 });
    expect(calls.length).toBe(5);
    expect(calls.every((c) => c.method === 'GET')).toBe(true);
    expect(calls.every((c) => c.endpoint.startsWith('/api/companies/') && c.endpoint.includes('/reports/'))).toBe(true);
  });

  it('la descripción avisa de la caché de Reportia y de que las cifras no se recalculan', () => {
    const d = incomeStatementTools[0]!.description;
    expect(d).toMatch(/5 minutos/);
    expect(d).toMatch(/no (las )?(recalcul|convier)/i);
    expect(d).toMatch(/solo lectura/i);
  });
});

describe('B-2: `query` y `warnings` son nombres reservados de la tool (contrato §7, sin pisar a Reportia)', () => {
  it.each([
    ['query', { query: { companyId: 99 } }],
    ['warnings', { warnings: [{ code: 'DEP', message: 'aviso de Reportia' }] }],
    ['query y warnings', { query: { x: 1 }, warnings: [] }],
  ])('campo propio de Reportia en la raíz (%s) => UPSTREAM_CONTRACT_MISMATCH con el nombre, una llamada y sin datos parciales', async (label, extra) => {
    const { mcp, calls } = await connect({ companyId: 7 }, () => ({ ...summaryFixture(), ...extra }));
    const r = await invoke(mcp, { ...PERIOD });
    expect(r.isError).toBe(true);
    expect(r.json.code).toBe('UPSTREAM_CONTRACT_MISMATCH');
    for (const k of Object.keys(extra)) {
      expect(r.json.message).toContain(`"${k}"`);
      expect(r.json.details.reservedFields).toContain(k);
    }
    expect(calls).toHaveLength(1);
    expect(r.json.lines).toBeUndefined();
    expect(label).toBeTruthy();
  });

  it('también en el desglose de una línea', async () => {
    const { mcp, calls } = await connect({ companyId: 7 }, () => ({ ...breakdownFixture(), warnings: [{ code: 'X' }] }));
    const r = await invoke(mcp, { ...PERIOD, account: '520505' });
    expect(r.json.code).toBe('UPSTREAM_CONTRACT_MISMATCH');
    expect(r.json.details.reservedFields).toEqual(['warnings']);
    expect(calls).toHaveLength(1);
  });

  it('caso válido sin esos campos: sigue saliendo igual, solo con query y warnings añadidos', async () => {
    const { mcp } = await connect({ companyId: 7 }, () => summaryFixture());
    const r = await invoke(mcp, { ...PERIOD });
    expect(r.isError).toBeFalsy();
    expect(r.json.query).toBeDefined();
    expect(r.json.warnings).toEqual([]);
    expect(r.json.grossProfit).toEqual(summaryFixture().grossProfit);
  });
});

describe('B-3: toda hoja con movimientos trae `movements` cuando se pidieron movimientos (contrato §5, T3-02)', () => {
  const leaves = (f: any) => [
    f.lines.income.children[0].children[0],
    f.lines.income.children[0].children[1] ?? null,
    f.lines.cost.children[0].children[0],
    f.lines.expense.children[0].children[0],
  ].filter(Boolean);

  it.each([
    ['ingresos', (f: any) => delete f.lines.income.children[0].children[0].movements],
    ['costos', (f: any) => delete f.lines.cost.children[0].children[0].movements],
    ['gastos', (f: any) => delete f.lines.expense.children[0].children[0].movements],
  ])('hoja de %s sin movements con movementsPerAccount 5 => UPSTREAM_CONTRACT_MISMATCH, una llamada, sin datos parciales', async (_l, mutate) => {
    const f = summaryFixture();
    mutate(f);
    const { mcp, calls } = await connect({ companyId: 7 }, () => f);
    const r = await invoke(mcp, { ...PERIOD, movementsPerAccount: 5 });
    expect(r.isError).toBe(true);
    expect(r.json.code).toBe('UPSTREAM_CONTRACT_MISMATCH');
    expect(r.json.details.leaves).toHaveLength(1);
    expect(calls).toHaveLength(1);
    expect(r.json.lines).toBeUndefined();
  });

  it('con movementsPerAccount 0 el bloque puede faltar (erratum E3)', async () => {
    const f = summaryFixture();
    for (const l of leaves(f)) delete l.movements;
    const { mcp } = await connect({ companyId: 7 }, () => f);
    const r = await invoke(mcp, { ...PERIOD, movementsPerAccount: 0 });
    expect(r.isError).toBeFalsy();
  });

  it('una hoja con movementCount 0 puede no traer bloque (no hay nada que declarar)', async () => {
    const f = summaryFixture();
    const l = f.lines.income.children[0].children[0];
    l.movementCount = 0;
    delete l.movements;
    const { mcp } = await connect({ companyId: 7 }, () => f);
    const r = await invoke(mcp, { ...PERIOD, movementsPerAccount: 5 });
    expect(r.isError).toBeFalsy();
  });

  it('fixture completo con movementsPerAccount 5 sigue aceptándose', async () => {
    const { mcp } = await connect({ companyId: 7 }, () => summaryFixture());
    const r = await invoke(mcp, { ...PERIOD, movementsPerAccount: 5 });
    expect(r.isError).toBeFalsy();
  });
});

describe('extensiones (contrato §7): una clave desconocida en cualquier nivel se tolera y se propaga intacta', () => {
  const leafLike = { leaf: true, key: 'metadata', movementCount: 3 };
  const movementLike = { id: 1, date: '2026-10-05', direction: 'D', amount: '1.00' };
  /** Una extensión de cada tipo, con forma que imita un nodo hoja o un movimiento. */
  const EXTENSIONS: Array<[string, unknown]> = [
    ['objeto con forma de hoja', leafLike],
    ['objeto con forma de movimiento', movementLike],
    ['cadena', 'valor-extra'],
    ['arreglo de hojas', [leafLike, { ...leafLike, key: 'otra' }]],
  ];

  const summaryLevels: Array<[string, (f: any) => any]> = [
    ['raíz', (f) => f],
    ['company', (f) => f.company],
    ['period', (f) => f.period],
    ['lines', (f) => f.lines],
    ['nodo de clase', (f) => f.lines.income],
    ['nodo de grupo', (f) => f.lines.income.children[0]],
    ['hoja', (f) => f.lines.income.children[0].children[0]],
    ['provenance de un nodo', (f) => f.lines.income.provenance],
    ['provenance.filter de un nodo', (f) => f.lines.income.provenance.filter],
    ['provenance.filter de una hoja', (f) => f.lines.income.children[0].children[0].provenance.filter],
    ['movements', (f) => f.lines.income.children[0].children[0].movements],
    ['fila de movements', (f) => f.lines.income.children[0].children[0].movements.rows[0]],
    ['remainder', (f) => f.lines.income.children[0].children[0].movements.remainder],
    ['grossProfit', (f) => f.grossProfit],
    ['elemento de unclassified', (f) => f.unclassified[0]],
    ['provenance.filter de unclassified', (f) => f.unclassified[0].provenance.filter],
    ['definition', (f) => f.definition],
    ['dataQuality', (f) => f.dataQuality],
    ['dataQuality.voided', (f) => f.dataQuality.voided],
    ['rowBudget', (f) => f.rowBudget],
  ];

  const breakdownLevels: Array<[string, (f: any) => any]> = [
    ['desglose: raíz', (f) => f],
    ['desglose: totals', (f) => f.totals],
    ['desglose: page', (f) => f.page],
    ['desglose: fila', (f) => f.rows[0]],
    ['desglose: dataQuality', (f) => f.dataQuality],
  ];

  const cases = [
    ...summaryLevels.flatMap(([lvl, at]) => EXTENSIONS.map(([ext, value]) => ({ drill: false, lvl, at, ext, value }))),
    ...breakdownLevels.flatMap(([lvl, at]) => EXTENSIONS.map(([ext, value]) => ({ drill: true, lvl, at, ext, value }))),
  ];

  it.each(cases.map((c) => [`${c.lvl} · ${c.ext}`, c] as const))('%s', async (_name, c) => {
    const sent = c.drill ? breakdownFixture() : summaryFixture();
    c.at(sent).extension = structuredClone(c.value);
    const { mcp } = await connect({ companyId: 7 }, () => structuredClone(sent));
    const args = c.drill ? { ...PERIOD, account: '520505', limit: 1, offset: 1 } : { ...PERIOD, movementsPerAccount: 5 };
    const r = await invoke(mcp, args);
    expect(r.isError, r.text).toBe(false);
    const { query, warnings, ...upstream } = r.json;
    expect(query).toBeDefined();
    expect(warnings).toEqual([]);
    expect(upstream).toEqual(sent);
  });

  it('una extensión con forma de hoja en `lines` no oculta una hoja real sin movements', async () => {
    const f = summaryFixture();
    f.lines.extension = leafLike;
    delete f.lines.cost.children[0].children[0].movements;
    const { mcp } = await connect({ companyId: 7 }, () => f);
    const r = await invoke(mcp, { ...PERIOD, movementsPerAccount: 5 });
    expect(r.isError).toBe(true);
    expect(r.json.details.leaves).toEqual([f.lines.cost.children[0].children[0].key]);
  });

  it('`query` y `warnings` en niveles internos no están reservados', async () => {
    const f = summaryFixture();
    f.lines.query = leafLike;
    f.company.warnings = ['x'];
    const { mcp } = await connect({ companyId: 7 }, () => structuredClone(f));
    const r = await invoke(mcp, { ...PERIOD, movementsPerAccount: 5 });
    expect(r.isError, r.text).toBe(false);
    const { query, warnings, ...upstream } = r.json;
    expect(upstream).toEqual(f);
  });
});

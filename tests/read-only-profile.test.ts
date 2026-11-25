/**
 * Perfil de solo lectura y lista canónica de tools.
 *
 * Casos T0-01…T0-11. Usan el servidor real con
 * `InMemoryTransport` y un cliente HTTP falso que cuenta las llamadas y
 * registra el método; no tocan red ni datos reales.
 */
import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

import { buildTestConfig, ConfigError, loadConfig } from '../src/config.js';
import { createMcpServer } from '../src/server.js';
import { allTools } from '../src/tools/index.js';
import {
  MUTATING_TOOLS,
  READ_ONLY_TOOLS,
  SENSITIVE_READ_TOOLS,
  readOnlyProfileArtifact,
  toolsForProfile,
} from '../src/read-only-tools.js';
import { resolveCompanyId, type ToolContext } from '../src/tool-base.js';
import type { ReportiaClient } from '../src/client.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const INCOME_STATEMENT_FIXTURE = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', 'income-statement.synthetic.json'), 'utf8'),
);

interface Recorded {
  kind: 'call' | 'download';
  method: string;
  endpoint: string;
  body?: unknown;
}

function fakeClient() {
  const calls: Recorded[] = [];
  const client = {
    version: 'fake',
    async call(endpoint: string, options?: { method?: string; body?: unknown }) {
      calls.push({ kind: 'call', method: options?.method ?? 'GET', endpoint, body: options?.body });
      // La tool de estado de resultados valida la forma de la respuesta de Reportia.
      if (endpoint.endsWith('/reports/income-statement')) return INCOME_STATEMENT_FIXTURE;
      return { ok: true };
    },
    async download(endpoint: string, options?: { method?: string }) {
      calls.push({ kind: 'download', method: options?.method ?? 'GET', endpoint });
      return { absolutePath: '/tmp/x', bytes: 1, contentType: null, suggestedFileName: 'x' };
    },
    async close() {},
    diagnostics() {
      return {} as never;
    },
    invalidateSession() {},
  } as unknown as ReportiaClient;
  return { client, calls };
}

async function connect(overrides: Parameters<typeof buildTestConfig>[0], fake = fakeClient()) {
  const server = createMcpServer(buildTestConfig(overrides), fake.client);
  const mcp = new Client({ name: 'test', version: '0.0.0' });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(a), mcp.connect(b)]);
  return { mcp, calls: fake.calls };
}

/**
 * Llamada a una tool que el servidor no registra. El SDK 1.30 la rechaza con
 * el error de protocolo `-32602 «Tool X not found»`; según el camino puede
 * llegar al cliente como `McpError` lanzado o como resultado `isError` con ese
 * texto (así lo hace 1.30 en `tools/call`). Ambos significan «tool no
 * disponible, sin efecto»; el test acepta los dos y exige el código y el texto.
 */
async function callRejected(mcp: Client, name: string, args: Record<string, unknown>) {
  try {
    const r = await mcp.callTool({ name, arguments: args });
    expect(r.isError, `${name} no debió ejecutarse`).toBe(true);
    return { text: JSON.stringify(r.content) };
  } catch (e) {
    return { text: e instanceof Error ? `${(e as { code?: number }).code ?? ''} ${e.message}` : String(e) };
  }
}

/** Argumentos mínimos válidos para cada tool de consulta (T0-09). */
const MIN_ARGS: Record<string, Record<string, unknown>> = {
  reportia_account_codes_search: { prefix: '1' },
  reportia_cost_center_report_export_excel: { startDate: '2025-01-01', endDate: '2025-01-31', reportId: 1 },
  reportia_cost_center_report_export_pdf: { startDate: '2025-01-01', endDate: '2025-01-31', reportId: 1 },
  reportia_cost_center_report_get: { reportId: 1 },
  reportia_line_group_description: { line: 'L', group: 'G' },
  reportia_line_group_suggestions_by_type: { type: 'lines' },
  reportia_income_statement_get: { dateFrom: '2026-10-01', dateTo: '2026-10-31' },
  reportia_movements_export_excel: { format: 'excel' },
  reportia_movements_export_pdf: { format: 'pdf' },
  reportia_movements_list: { dateFrom: '2025-01-01' },
  reportia_siigo_run_trace_get: { runId: 1 },
  reportia_third_parties_get_by_nit: { nit: '900123' },
  reportia_third_parties_portfolio_balance: { nits: ['900123'], cutoffDate: '2025-01-31' },
  reportia_third_parties_search: { q: 'abc' },
  reportia_upload_status_get: { uploadId: 1 },
};

const names = (xs: readonly { name: string }[]) => xs.map((t) => t.name);

describe('HU-0 · perfil de solo lectura', () => {
  it('T0-01: tools/list con readOnly devuelve exactamente las 38 de la lista canónica y ninguna mutante', async () => {
    const { mcp } = await connect({ readOnly: true, companyId: 7 });
    const listed = (await mcp.listTools()).tools.map((t) => t.name);
    const artifact = JSON.parse(fs.readFileSync(path.join(ROOT, 'read-only-tools.json'), 'utf8'));
    expect(listed).toHaveLength(38);
    expect([...listed].sort()).toEqual([...READ_ONLY_TOOLS]);
    expect([...listed].sort()).toEqual(artifact.tools);
    // El orden de registro es el de allTools (estable).
    expect(listed).toEqual(names(allTools).filter((n) => READ_ONLY_TOOLS.includes(n)));
    for (const m of MUTATING_TOOLS) expect(listed).not.toContain(m);
    for (const s of SENSITIVE_READ_TOOLS) expect(listed).not.toContain(s);
  });

  describe('T0-02: las 26 mutantes fallan como "not found" sin tocar el cliente HTTP', () => {
    it.each([...MUTATING_TOOLS])('%s', async (name) => {
      const { mcp, calls } = await connect({ readOnly: true, companyId: 7 });
      const r = await callRejected(mcp, name, { companyId: 7, confirm: true });
      expect(r.text).toMatch(/-32602/);
      expect(r.text).toMatch(/Tool .* not found/);
      expect(calls).toHaveLength(0);
    });
  });

  it('T0-02b: las 3 lecturas sensibles tampoco se pueden llamar', async () => {
    for (const name of SENSITIVE_READ_TOOLS) {
      const { mcp, calls } = await connect({ readOnly: true, companyId: 7 });
      const r = await callRejected(mcp, name, { companyId: 7 });
      expect(r.text).toMatch(/Tool .* not found/);
      expect(calls).toHaveLength(0);
    }
  });

  it('T0-03: portfolio_balance está en el perfil y propaga el POST tal cual', async () => {
    const { mcp, calls } = await connect({ readOnly: true, companyId: 7 });
    expect((await mcp.listTools()).tools.map((t) => t.name)).toContain('reportia_third_parties_portfolio_balance');
    await mcp.callTool({
      name: 'reportia_third_parties_portfolio_balance',
      arguments: { nits: ['900123'], cutoffDate: '2025-01-31' },
    });
    expect(calls).toEqual([
      {
        kind: 'call',
        method: 'POST',
        endpoint: '/api/companies/7/third-parties/portfolio-balance',
        body: { nits: ['900123'], cutoffDate: '2025-01-31' },
      },
    ]);
  });

  it('T0-04: exhaustividad: 67 = 38 + 3 + 26, sin intersecciones y sin tools sin clasificar', () => {
    const lists = [READ_ONLY_TOOLS, SENSITIVE_READ_TOOLS, MUTATING_TOOLS];
    const union = lists.flat();
    expect(union).toHaveLength(67);
    expect(new Set(union).size).toBe(67);
    expect([...union].sort()).toEqual(names(allTools).sort());
    expect([READ_ONLY_TOOLS.length, SENSITIVE_READ_TOOLS.length, MUTATING_TOOLS.length]).toEqual([38, 3, 26]);
  });

  it('T0-04b (meta): una tool nueva sin clasificar haría fallar el chequeo', () => {
    const fake = [...allTools, { name: 'reportia_tool_nueva_sin_clasificar' }];
    const union = new Set<string>([...READ_ONLY_TOOLS, ...SENSITIVE_READ_TOOLS, ...MUTATING_TOOLS]);
    const unclassified = fake.map((t) => t.name).filter((n) => !union.has(n));
    expect(unclassified).toEqual(['reportia_tool_nueva_sin_clasificar']);
  });

  it('T0-05: read-only-tools.json coincide con el código y viaja en el paquete', () => {
    const artifact = JSON.parse(fs.readFileSync(path.join(ROOT, 'read-only-tools.json'), 'utf8'));
    expect(artifact).toEqual(readOnlyProfileArtifact());
    expect(artifact.schemaVersion).toBe(1);
    expect(artifact.profile).toBe('read-only');
    expect(artifact.tools).toEqual([...artifact.tools].sort());
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    expect(pkg.files).toContain('read-only-tools.json');
  });

  describe('T0-06: sin el flag el servidor expone las 67 tools (las 66 de 0.3.7 más la de estado de resultados)', () => {
    it.each([
      ['ausente', {}],
      ['readOnly=false', { readOnly: false }],
    ])('%s', async (_label, overrides) => {
      const { mcp } = await connect(overrides);
      const listed = (await mcp.listTools()).tools.map((t) => t.name);
      expect(listed).toHaveLength(67);
      expect(listed).toEqual(names(allTools));
    });

    it('loadConfig: ausente, vacío, false y 0 dan readOnly=false', () => {
      const base = { REPORTIA_BASE_URL: 'http://localhost:5000', REPORTIA_TOKEN: 't' };
      for (const v of [undefined, '', 'false', '0', 'FALSE']) {
        const env = (v === undefined ? base : { ...base, REPORTIA_READ_ONLY: v }) as NodeJS.ProcessEnv;
        expect(loadConfig(env).readOnly).toBe(false);
      }
      for (const v of ['true', '1', 'TRUE', 'True']) {
        expect(loadConfig({ ...base, REPORTIA_READ_ONLY: v } as NodeJS.ProcessEnv).readOnly).toBe(true);
      }
    });

    it('toolsForProfile sin flag devuelve todo, con flag filtra', () => {
      expect(toolsForProfile(allTools, {})).toHaveLength(67);
      expect(toolsForProfile(allTools, { readOnly: true })).toHaveLength(38);
    });
  });

  it.each(['yes', 'ture', '2', ' true', 'true '])(
    'T0-07: valor inválido %j de REPORTIA_READ_ONLY impide cargar la configuración',
    (v) => {
      const env = { REPORTIA_BASE_URL: 'http://localhost:5000', REPORTIA_TOKEN: 't', REPORTIA_READ_ONLY: v };
      expect(() => loadConfig(env as NodeJS.ProcessEnv)).toThrow(ConfigError);
      expect(() => loadConfig(env as NodeJS.ProcessEnv)).toThrow(/REPORTIA_READ_ONLY/);
    },
  );

  it('T0-09a: las 15 tools con destructive:true están en MUTATING_TOOLS', () => {
    const destructive = allTools.filter((t) => (t as { destructive?: boolean }).destructive).map((t) => t.name);
    expect(destructive).toHaveLength(15);
    for (const n of destructive) expect(MUTATING_TOOLS).toContain(n);
  });

  it('T0-09b: ninguna tool del perfil usa un método HTTP distinto de GET, salvo portfolio_balance', async () => {
    const { mcp, calls } = await connect({ readOnly: true, companyId: 7 });
    for (const name of READ_ONLY_TOOLS) {
      const before = calls.length;
      const r = await mcp.callTool({ name, arguments: { companyId: 7, ...(MIN_ARGS[name] ?? {}) } });
      expect(r.isError, `${name} rechazó los args mínimos: ${JSON.stringify(r.content)}`).toBeFalsy();
      expect(calls.length, `${name} no llamó al cliente`).toBeGreaterThan(before);
    }
    const nonGet = calls.filter((c) => c.method !== 'GET');
    expect(nonGet.map((c) => c.endpoint)).toEqual(['/api/companies/7/third-parties/portfolio-balance']);
  });

  it('T0-10: con el flag y default 7, un companyId distinto falla con COMPANY_MISMATCH y 0 llamadas', async () => {
    const { mcp, calls } = await connect({ readOnly: true, companyId: 7 });
    const r = await mcp.callTool({
      name: 'reportia_movements_list',
      arguments: { companyId: 9, dateFrom: '2025-01-01' },
    });
    expect(r.isError).toBe(true);
    expect(JSON.stringify(r.content)).toContain('COMPANY_MISMATCH');
    expect(calls).toHaveLength(0);
    // La empresa fijada, o la ausencia de input, pasan.
    for (const args of [{ companyId: 7 }, {}]) {
      const ok = await mcp.callTool({ name: 'reportia_movements_list', arguments: { dateFrom: '2025-01-01', ...args } });
      expect(ok.isError).toBeFalsy();
    }
    expect(calls).toHaveLength(2);
    expect(calls.every((c) => c.endpoint.startsWith('/api/companies/7/'))).toBe(true);
  });

  it('T0-10b: resolveCompanyId: candado activo / sin candado / sin default', () => {
    const c = {} as unknown as ReportiaClient;
    const locked = (d?: number): ToolContext => ({ client: c, defaultCompanyId: d, lockCompany: true });
    expect(() => resolveCompanyId({ companyId: 9 }, locked(7))).toThrow(/COMPANY_MISMATCH|distinto/);
    expect(resolveCompanyId({ companyId: '7' as unknown as number }, locked(7))).toBe(7);
    expect(resolveCompanyId({}, locked(7))).toBe(7);
    // Sin default no hay con qué comparar: comportamiento histórico.
    expect(resolveCompanyId({ companyId: 9 }, locked(undefined))).toBe(9);
    // Sin candado el input sigue mandando (test histórico).
    expect(resolveCompanyId({ companyId: 9 }, { client: c, defaultCompanyId: 7 })).toBe(9);
    expect(resolveCompanyId({ companyId: 9 }, { client: c, defaultCompanyId: 7, lockCompany: false })).toBe(9);
  });

  it('T0-10c / criterio (h): sin el flag y con REPORTIA_COMPANY_ID=7, companyId 9 de entrada va a /api/companies/9/…', async () => {
    const { mcp, calls } = await connect({ companyId: 7 });
    await mcp.callTool({ name: 'reportia_movements_list', arguments: { companyId: 9, dateFrom: '2025-01-01' } });
    expect(calls[0]?.endpoint.startsWith('/api/companies/9/')).toBe(true);
  });

  it('T0-11: las 5 exportaciones están en el perfil y siguen usando download', async () => {
    const exports = READ_ONLY_TOOLS.filter((n) => /_export_(excel|pdf)$/.test(n));
    expect(exports).toHaveLength(5);
    const { mcp, calls } = await connect({ readOnly: true, companyId: 7 });
    for (const name of exports) {
      const before = calls.length;
      await mcp.callTool({ name, arguments: { companyId: 7, ...(MIN_ARGS[name] ?? {}) } });
      expect(calls.slice(before).some((c) => c.kind === 'download'), name).toBe(true);
    }
  });
});

/** Los 66 nombres de 0.3.7 (`main`@78eda26), en orden de registro. Lista literal congelada. */
const TOOLS_0_3_7: readonly string[] = [
  'reportia_health',
  'reportia_whoami',
  'reportia_logout',
  'reportia_companies_list',
  'reportia_company_get',
  'reportia_company_settings_get',
  'reportia_company_settings_update',
  'reportia_company_activate',
  'reportia_movements_list',
  'reportia_movements_export_excel',
  'reportia_movements_export_pdf',
  'reportia_movements_delete_all',
  'reportia_account_mappings_list',
  'reportia_account_mapping_create',
  'reportia_account_mapping_update',
  'reportia_account_mapping_delete',
  'reportia_account_codes_search',
  'reportia_commission_list',
  'reportia_commission_export_excel',
  'reportia_third_parties_list',
  'reportia_third_parties_search',
  'reportia_third_parties_get_by_nit',
  'reportia_third_parties_portfolio_balance',
  'reportia_salesperson_mappings_list',
  'reportia_salesperson_mapping_create',
  'reportia_salesperson_mapping_update',
  'reportia_salesperson_mapping_delete',
  'reportia_salesperson_options_list',
  'reportia_invoices_list',
  'reportia_invoice_settings_get',
  'reportia_invoice_settings_create',
  'reportia_invoice_settings_update',
  'reportia_invoice_email_send',
  'reportia_invoices_send_multiple',
  'reportia_line_group_mappings_list',
  'reportia_line_group_mapping_create',
  'reportia_line_group_mapping_update',
  'reportia_line_group_mapping_delete',
  'reportia_line_group_suggestions_lines_groups',
  'reportia_line_group_suggestions_by_type',
  'reportia_line_group_description',
  'reportia_cost_center_mappings_list',
  'reportia_cost_center_mapping_create',
  'reportia_cost_center_mapping_update',
  'reportia_cost_center_mapping_delete',
  'reportia_cost_center_mappings_suggestions',
  'reportia_cost_centers_available',
  'reportia_cost_center_reports_list',
  'reportia_cost_center_report_get',
  'reportia_cost_center_report_create',
  'reportia_cost_center_report_update',
  'reportia_cost_center_report_delete',
  'reportia_cost_center_report_execute',
  'reportia_cost_center_report_duplicate',
  'reportia_cost_center_report_export_excel',
  'reportia_cost_center_report_export_pdf',
  'reportia_uploads_history_list',
  'reportia_upload_status_get',
  'reportia_health_queue_system',
  'reportia_health_workers',
  'reportia_siigo_settings_get',
  'reportia_siigo_clients_list',
  'reportia_siigo_sync_runs_list',
  'reportia_siigo_run_trace_get',
  'reportia_siigo_schedules_list',
  'reportia_siigo_history_get',
];

describe('HU-0 · el perfil es opcional y no cambia el comportamiento por defecto', () => {
  it('(g) sin flag, `false` o `0`, tools/list es la lista literal de 0.3.7 (66, mismo orden) más la tool nueva al final', async () => {
    expect(TOOLS_0_3_7).toHaveLength(66);
    expect(new Set(TOOLS_0_3_7).size).toBe(66);
    const expected = [...TOOLS_0_3_7, 'reportia_income_statement_get'];
    for (const overrides of [{}, { readOnly: false }]) {
      const { mcp } = await connect(overrides);
      expect((await mcp.listTools()).tools.map((t) => t.name)).toEqual(expected);
    }
    const base = { REPORTIA_BASE_URL: 'http://localhost:5000', REPORTIA_TOKEN: 't' };
    for (const v of [undefined, 'false', '0']) {
      const env = (v === undefined ? base : { ...base, REPORTIA_READ_ONLY: v }) as NodeJS.ProcessEnv;
      const server = createMcpServer(loadConfig(env), fakeClient().client);
      const mcp = new Client({ name: 'test', version: '0.0.0' });
      const [a, b] = InMemoryTransport.createLinkedPair();
      await Promise.all([server.connect(a), mcp.connect(b)]);
      expect((await mcp.listTools()).tools.map((t) => t.name)).toEqual(expected);
    }
  });

  it('(i) la configuración mínima, sin REPORTIA_READ_ONLY, da readOnly === false', () => {
    const cfg = loadConfig({ REPORTIA_BASE_URL: 'http://localhost:5000', REPORTIA_TOKEN: 't' } as NodeJS.ProcessEnv);
    expect(cfg.readOnly).toBe(false);
    expect(buildTestConfig({}).readOnly).toBe(false);
  });

  describe('(j) la documentación no afirma que el perfil proteja o limite el chat', () => {
    const files = ['README.md', 'CHANGELOG.md', 'server.json'];
    const notesDir = path.join(ROOT, 'release-notes');
    const notes = fs.existsSync(notesDir)
      ? fs.readdirSync(notesDir).filter((f) => f.endsWith('.md')).map((f) => path.join('release-notes', f))
      : [];
    const docs = [...files, ...notes].map((f) => ({ f, text: fs.readFileSync(path.join(ROOT, f), 'utf8') }));

    // Frases que afirmarían que el perfil protege/limita al chat o que obligan a activarlo.
    const FORBIDDEN: [RegExp, string][] = [
      [/ya no puede (escribir|borrar|leer|modificar|crear|enviar)/i, '«ya no puede …»'],
      [/no puede (escribir ni borrar|crear, cambiar ni borrar)/i, '«no puede escribir ni borrar»'],
      [/el perfil (protege|limita|bloquea|impide)/i, '«el perfil protege/limita/bloquea/impide»'],
      [/(protege|limita|restringe) (al|el) (chat|asistente)/i, '«protege/limita al chat»'],
      [/fije\s+\*{0,2}a la vez\*{0,2}/i, '«fije a la vez … allowedTools»'],
      [/allowedTools[^.\n]*(obligatori|debe)/i, '«allowedTools obligatorio»'],
      [/\b(RPT|CWK|MCPR)-\d+/, 'identificador interno'],
      [/instancia.feedback|\/home\/u[b]untu/, 'ruta interna'],
      [/en cl[a]ro/i, 'divulgación de secretos'],
      [/(debe|deben) (fijar|activar) (el perfil|`?REPORTIA_READ_ONLY)/i, '«debe activar el perfil»'],
    ];

    it.each(docs.map((d) => [d.f, d.text] as const))('%s', (_f, text) => {
      for (const [re, label] of FORBIDDEN) {
        expect(re.test(text), `afirma ${label}`).toBe(false);
      }
    });

    it('la nota de release dice que para el chat de producción «no cambia» y lista los riesgos vigentes', () => {
      const note = docs.find((d) => /^release-notes[\\/]\d{4}-\d{2}-\d{2}-mcp-reportia\.md$/.test(d.f));
      expect(note, 'falta la nota de release').toBeDefined();
      const t = note!.text;
      expect(t).toMatch(/chat de producci[oó]n no cambia/i);
      expect(t).toMatch(/Lo que NO cambia/);
      expect(t).toMatch(/Lo que todav[ií]a puede fallar/);
      for (const risk of [/reportia_logout/, /sin pedir confirmaci[oó]n/i, /facturas por correo/i]) {
        expect(t).toMatch(risk);
      }
      expect(t).toMatch(/configuraci[oó]n de tu empresa, que incluye datos sensibles/i);
      expect(t).toMatch(/no compartas esas conversaciones/i);
      expect(t).toMatch(/antes de cambiar, borrar o sincronizar datos/i);
      expect(t).toMatch(/datos incompletos en los terceros o en los documentos de un movimiento/i);
      expect(t).toMatch(/error de contrato en vez de mostrar cifras/i);
      expect(t).toMatch(/2 MiB se mide sobre el texto/i);
      expect(t).toMatch(/hasta casi el triple \(≈3 veces\)/i);
      expect(t).not.toMatch(/el doble|≈ ?2 veces|1,6|60 ?%/i);
    });

    it('README y CHANGELOG declaran el margen de transmisión como hasta casi el triple, sin cifras menores', () => {
      const readme = docs.find((d) => d.f === 'README.md')!.text;
      const changelog = docs.find((d) => d.f === 'CHANGELOG.md')!.text;
      expect(readme).toMatch(/2 MiB[^|\n]*hasta casi el triple \(≈3 veces\)/i);
      expect(changelog).toMatch(/hasta casi el triple \(≈3 veces\) su tamaño en texto/i);
      for (const text of [readme, changelog]) expect(text).not.toMatch(/el doble|≈ ?2 veces|≈1,6|1,6|cerca del 60 ?%|60 ?%/i);
    });

    it('README, CHANGELOG y server.json dicen que el valor vacío equivale a apagado', () => {
      for (const f of ['README.md', 'CHANGELOG.md', 'server.json']) {
        const text = docs.find((d) => d.f === f)!.text;
        expect(text, f).toMatch(/vac[ií]o|empty/i);
      }
    });

    it('la descripción de REPORTIA_READ_ONLY en server.json cabe en 100 caracteres', () => {
      const sj = JSON.parse(docs.find((d) => d.f === 'server.json')!.text);
      const vars = sj.packages.flatMap((p: { environmentVariables?: { name: string; description: string }[] }) => p.environmentVariables ?? []);
      const v = vars.find((e: { name: string }) => e.name === 'REPORTIA_READ_ONLY');
      expect(v).toBeDefined();
      expect(v.description.length).toBeLessThanOrEqual(100);
    });

    it('el README declara el perfil apagado por defecto y fuera del chat de producción', () => {
      const readme = docs.find((d) => d.f === 'README.md')!.text;
      expect(readme).toMatch(/apagado por defecto/i);
      expect(readme).toMatch(/no se activa en el chat de producci[oó]n/i);
    });
  });
});

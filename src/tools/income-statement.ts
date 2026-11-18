/**
 * Estado de resultados con procedencia de cada total.
 *
 * `reportia_income_statement_get` es un envoltorio delgado sobre dos rutas de
 * solo lectura de Reportia:
 *
 *  - sin `account`: `GET /api/companies/:id/reports/income-statement`
 *    (el estado de resultados completo, con la procedencia de cada nodo);
 *  - con `account`: `GET /api/companies/:id/reports/account-aggregates/movements`
 *    (el desglose paginado de una línea, para pedir «el resto» de movimientos).
 *
 * Reglas:
 *  - Reportia es dueño de la forma y de las cifras. La tool valida la respuesta
 *    de forma no estricta (exige lo que el contrato declara, tolera campos
 *    nuevos) y la devuelve TAL CUAL, más `query` (eco de lo pedido) y
 *    `warnings`. Nunca recalcula, redondea ni reescribe un monto.
 *  - Una sola capa de truncado: la de Reportia (`movements.remainder`,
 *    `rowBudget`). Esta tool no recorta; solo responde `OUTPUT_TOO_LARGE`, sin
 *    datos parciales, si la salida supera `MAX_OUTPUT_BYTES`.
 *  - `companyId` solo viaja en la ruta, nunca en la consulta.
 *  - Solo `GET`, sin reintentos.
 */
import { z } from 'zod';
import { ReportiaError } from '../errors.js';
import type { ToolDefinition } from '../tool-base.js';
import { fail, IsoDateString, ok, resolveCompanyId } from '../tool-base.js';

/** Tope de bytes de la salida de una llamada (2 MiB): red de seguridad, no un recorte. */
export const MAX_OUTPUT_BYTES = 2 * 1024 * 1024;

/** Valor por defecto de `movementsPerAccount`; se envía siempre de forma explícita. */
const DEFAULT_MOVEMENTS_PER_ACCOUNT = 5;
const DEFAULT_LIMIT = 100;

// ------------------------------------------------------------------ entrada

const IncomeStatementInput = z
  .object({
    dateFrom: IsoDateString.describe('Inicio del periodo, YYYY-MM-DD, inclusivo.'),
    dateTo: IsoDateString.describe('Fin del periodo, YYYY-MM-DD, inclusivo. Debe ser >= dateFrom.'),
    movementsPerAccount: z
      .number()
      .int()
      .min(0)
      .max(50)
      .default(DEFAULT_MOVEMENTS_PER_ACCOUNT)
      .describe(
        'Movimientos de muestra por cuenta (0-50, por defecto 5). Solo aplica al estado de resultados; el desglose (con account) no lo usa.',
      ),
    account: z
      .string()
      .regex(/^\d{1,10}$/, { message: 'account: solo dígitos (1 a 10), código de cuenta o prefijo de una línea.' })
      .optional()
      .describe(
        'Código (o prefijo) de una línea del reporte. Con este campo la tool devuelve el desglose paginado de esa línea.',
      ),
    limit: z
      .number()
      .int()
      .min(1)
      .max(1000)
      .optional()
      .describe('Solo con account: movimientos por página (1-1000, por defecto 100).'),
    offset: z.number().int().min(0).optional().describe('Solo con account: cuántos movimientos saltar (por defecto 0).'),
    companyId: z
      .number()
      .int()
      .positive()
      .optional()
      .describe('Empresa. Opcional: si falta se usa REPORTIA_COMPANY_ID. Nunca viaja en la consulta, solo en la ruta.'),
    // Metadatos de transporte que algunos clientes MCP inyectan en los argumentos
    // (el handler no los lee). Declararlos evita que `.strict()` los rechace.
    signal: z.unknown().optional(),
    sessionId: z.string().optional(),
    _meta: z.unknown().optional(),
  })
  .strict();

type IncomeStatementArgs = z.infer<typeof IncomeStatementInput>;

// ------------------------------------------------- validación del upstream

/** Importe como cadena decimal exacta (nunca `number`). Puede ser negativo. */
const Money = z.string().regex(/^-?\d+(\.\d+)?$/, { message: 'importe decimal como cadena' });
const Count = z.number().int().nonnegative();
const IsoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const Company = z.object({ id: z.number().int() });
const Period = z.object({ dateFrom: IsoDay, dateTo: IsoDay });

const MovementRow = z.object({
  id: z.number().int(),
  date: IsoDay,
  document: z.object({ type: z.string(), code: z.string(), number: z.string().nullable() }),
  account: z.string(),
  accountName: z.string().nullable(),
  description: z.string().nullable(),
  third: z.object({ nit: z.string(), name: z.string().nullable() }),
  direction: z.enum(['D', 'C']),
  amount: Money,
});

const MovementsBlock = z.object({
  shownCount: Count,
  totalCount: Count,
  truncatedByBudget: z.boolean(),
  remainder: z.object({ count: Count, debit: Money, credit: Money }),
  rows: z.array(MovementRow),
});

/**
 * Descriptor reproducible de la fórmula (contrato §3.3): fechas, exclusión y UN
 * selector. El selector exigido depende del nodo: prefijo si agrega hijos,
 * cuenta si es una hoja. Se toleran campos adicionales.
 */
const FilterBase = { dateFrom: IsoDay, dateTo: IsoDay, excluded: z.array(z.string()) };
const PrefixProvenance = z.object({ filter: z.object({ accountPrefix: z.string().min(1), ...FilterBase }) });
const AccountProvenance = z.object({ filter: z.object({ account: z.string().min(1), ...FilterBase }) });
/** `unclassified[]`: la cuenta puede ser `null` cuando no hay código (contrato §3.5). */
const UnclassifiedProvenance = z.object({ filter: z.object({ account: z.string().nullable(), ...FilterBase }) });

const NodeBase = {
  key: z.string(),
  label: z.string(),
  resultClass: z.enum(['income', 'cost', 'expense']),
  debit: Money,
  credit: Money,
  amount: Money,
  movementCount: Count,
  movements: MovementsBlock.optional(),
};

// Hoja (`leaf: true`): selector `account`. Agregado (`leaf: false`): selector
// `accountPrefix` y `children` obligatorio (puede ir vacío si el contrato lo
// emite así; lo que no se admite es omitirlo).
const LineNode: z.ZodType<unknown> = z.lazy(() =>
  z.discriminatedUnion('leaf', [
    z.object({ ...NodeBase, leaf: z.literal(true), provenance: AccountProvenance }),
    z.object({
      ...NodeBase,
      leaf: z.literal(false),
      provenance: PrefixProvenance,
      children: z.array(LineNode),
    }),
  ]),
);

const DataQuality = z.object({
  voided: z.object({ count: Count, debit: Money, credit: Money }),
  invalidValue: z.object({ count: Count }),
  invalidDirection: z.object({ count: Count, amount: Money }),
  withoutDate: z.object({ count: Count }),
});

const IncomeStatementResponse = z.object({
  schemaVersion: z.literal(1),
  company: Company,
  period: Period,
  generatedAt: z.string(),
  lines: z.object({ income: LineNode, cost: LineNode, expense: LineNode }),
  grossProfit: z.object({ amount: Money }),
  unclassified: z.array(
    z.object({ key: z.string(), debit: Money, credit: Money, movementCount: Count, provenance: UnclassifiedProvenance }),
  ),
  definition: z.object({
    version: z.number().int(),
    text: z.string(),
    table: z.array(z.object({ prefix: z.string(), resultClass: z.string() })),
    notes: z.array(z.string()),
  }),
  dataQuality: DataQuality,
  rowBudget: z.object({ limit: Count, used: Count, truncated: z.boolean() }),
});

const BreakdownResponse = z.object({
  schemaVersion: z.literal(1),
  company: Company,
  period: Period,
  generatedAt: z.string(),
  lineKey: z.string(),
  totals: z.object({ count: Count, debit: Money, credit: Money }),
  page: z.object({ limit: Count, offset: Count, returned: Count, hasMore: z.boolean() }),
  rows: z.array(MovementRow),
  dataQuality: DataQuality,
});

/**
 * Valida (sin transformar) la respuesta. Devuelve el objeto original: lo que se
 * propaga es lo que dijo Reportia, no el resultado del parseo.
 */
function assertContract(data: unknown, schema: z.ZodTypeAny, what: string): Record<string, unknown> {
  const parsed = schema.safeParse(data);
  if (parsed.success) return data as Record<string, unknown>;
  const issues = parsed.error.issues.slice(0, 10).map((i) => ({ path: i.path.join('.'), message: i.message }));
  const version = (data as { schemaVersion?: unknown } | null)?.schemaVersion;
  const unknownVersion = version !== undefined && version !== 1;
  throw new ReportiaError({
    code: 'UPSTREAM_CONTRACT_MISMATCH',
    message: unknownVersion
      ? `La respuesta de Reportia (${what}) usa schemaVersion ${JSON.stringify(version)}, que esta versión de la tool no conoce.`
      : `La respuesta de Reportia (${what}) no cumple el contrato esperado.`,
    details: { issues },
  });
}

/** Claves de las hojas con `movementCount > 0` que no traen el bloque `movements`. */
function leavesMissingMovements(lines: Record<string, unknown>): string[] {
  const missing: string[] = [];
  const visit = (n: any): void => {
    if (!n || typeof n !== 'object') return;
    if (n.leaf === true) {
      if (n.movementCount > 0 && n.movements === undefined) missing.push(String(n.key));
      return;
    }
    if (Array.isArray(n.children)) n.children.forEach(visit);
  };
  Object.values(lines).forEach(visit);
  return missing;
}

// ----------------------------------------------------------- errores HTTP

/**
 * Traduce un error HTTP de Reportia a los códigos de esta tool. Conserva el
 * `code` de Reportia en `details.upstreamCode`. Los errores sin estado HTTP
 * (red, demora) y los propios de la tool pasan sin cambios.
 */
function mapUpstreamError(err: unknown): unknown {
  if (!(err instanceof ReportiaError) || err.status === undefined) return err;
  const body = err.details && typeof err.details === 'object' ? (err.details as Record<string, unknown>) : {};
  const code =
    err.status === 400
      ? 'INVALID_INPUT'
      : err.status === 401 || err.status === 403
        ? 'AUTH_ERROR'
        : err.status === 404
          ? 'NOT_FOUND'
          : err.status === 429
            ? 'RATE_LIMITED'
            : 'UNEXPECTED';
  return new ReportiaError({
    code,
    status: err.status,
    endpoint: err.endpoint,
    message: err.message,
    details: {
      upstreamCode: typeof body.code === 'string' ? body.code : undefined,
      upstreamStatus: err.status,
      ...(Array.isArray(body.issues) ? { issues: body.issues } : {}),
    },
  });
}

// ------------------------------------------------------------------ tool

const DESCRIPTION =
  'Estado de resultados de una empresa para un periodo (dateFrom y dateTo, inclusivos, YYYY-MM-DD), con la procedencia de cada total. ' +
  'Cada línea (clase 4 ingresos, 5 gastos, 6 costos; luego grupo y cuenta) trae provenance.filter (el filtro que reproduce la cifra), movementCount y, en las cuentas, ' +
  'hasta movementsPerAccount movimientos de muestra (por defecto 5) más remainder con lo que no se incluyó. ' +
  'Los montos son cadenas decimales exactas: no las conviertas a número ni las recalcules; preséntalas tal cual. ' +
  'Para pedir el resto de los movimientos de una línea, repite la llamada con account (código o prefijo de la línea) y limit/offset: devuelve el desglose paginado. ' +
  'La respuesta incluye unclassified (cuentas fuera de las clases 4, 5 y 6, que no entran en la utilidad bruta) y dataQuality (lo excluido o inválido): decláralos al usuario. ' +
  'companyId es opcional (si falta se usa REPORTIA_COMPANY_ID). Solo lectura. ' +
  'Reportia guarda los resultados en caché hasta 5 minutos: las cifras no son «en vivo».';

export const incomeStatementTools: ToolDefinition<any>[] = [
  {
    name: 'reportia_income_statement_get',
    description: DESCRIPTION,
    inputSchema: IncomeStatementInput,
    // El SDK descarta las claves no declaradas antes del handler; con passthrough
    // llegan al `.strict()` de arriba y se rechazan (INVALID_INPUT, sin llamada HTTP).
    registerSchema: IncomeStatementInput.passthrough(),
    handler: async (input: IncomeStatementArgs, ctx) => {
      try {
        if (input.dateFrom > input.dateTo) {
          throw new ReportiaError({
            code: 'INVALID_DATE_RANGE',
            message: `dateFrom (${input.dateFrom}) debe ser <= dateTo (${input.dateTo})`,
          });
        }
        const companyId = resolveCompanyId(input, ctx);
        const drill = input.account !== undefined;
        const warnings: Array<{ code: string; message: string }> = [];

        let endpoint: string;
        let query: Record<string, string | number>;
        let echo: Record<string, unknown>;
        if (drill) {
          const limit = input.limit ?? DEFAULT_LIMIT;
          const offset = input.offset ?? 0;
          endpoint = `/api/companies/${companyId}/reports/account-aggregates/movements`;
          query = { lineKey: input.account!, dateFrom: input.dateFrom, dateTo: input.dateTo, limit, offset };
          echo = { companyId, dateFrom: input.dateFrom, dateTo: input.dateTo, account: input.account, limit, offset };
        } else {
          endpoint = `/api/companies/${companyId}/reports/income-statement`;
          query = {
            dateFrom: input.dateFrom,
            dateTo: input.dateTo,
            movementsPerAccount: input.movementsPerAccount,
          };
          echo = {
            companyId,
            dateFrom: input.dateFrom,
            dateTo: input.dateTo,
            movementsPerAccount: input.movementsPerAccount,
          };
          if (input.limit !== undefined || input.offset !== undefined) {
            warnings.push({
              code: 'PARAM_IGNORED',
              message: 'limit y offset solo aplican junto con account (desglose de una línea); se ignoraron.',
            });
          }
        }

        let data: unknown;
        try {
          data = await ctx.client.call(endpoint, { method: 'GET', query });
        } catch (e) {
          throw mapUpstreamError(e);
        }
        const upstream = assertContract(data, drill ? BreakdownResponse : IncomeStatementResponse, drill ? 'desglose' : 'estado de resultados');

        // `query` y `warnings` son nombres reservados de la tool: si Reportia los manda
        // en la raíz se rechaza (no se pisan ni se descartan en silencio; contrato §7).
        const reserved = ['query', 'warnings'].filter((k) => Object.prototype.hasOwnProperty.call(upstream, k));
        if (reserved.length > 0) {
          throw new ReportiaError({
            code: 'UPSTREAM_CONTRACT_MISMATCH',
            message: `La respuesta de Reportia trae ${reserved.map((k) => `"${k}"`).join(' y ')} en la raíz, nombre${reserved.length > 1 ? 's' : ''} que esta tool reserva para su propia salida.`,
            details: { reservedFields: reserved },
          });
        }
        // Con movimientos pedidos, toda hoja con movimientos declara su bloque `movements`:
        // es lo que dice cuántos no se mostraron (contrato §5, T3-02).
        if (!drill && (input.movementsPerAccount ?? 0) > 0) {
          const missing = leavesMissingMovements((upstream as { lines: Record<string, unknown> }).lines);
          if (missing.length > 0) {
            throw new ReportiaError({
              code: 'UPSTREAM_CONTRACT_MISMATCH',
              message: 'La respuesta de Reportia no trae el bloque "movements" en hojas con movimientos aunque se pidieron movimientos.',
              details: { leaves: missing.slice(0, 10) },
            });
          }
        }

        const result = ok({ ...upstream, query: echo, warnings });
        if (result.ok) {
          const bytes = Buffer.byteLength(result.content, 'utf8');
          if (bytes > MAX_OUTPUT_BYTES) {
            throw new ReportiaError({
              code: 'OUTPUT_TOO_LARGE',
              message: drill
                ? `La respuesta (${bytes} bytes) supera el tope de ${MAX_OUTPUT_BYTES} bytes. Baja limit y pide el resto con offset.`
                : `La respuesta (${bytes} bytes) supera el tope de ${MAX_OUTPUT_BYTES} bytes. Baja movementsPerAccount o pide el desglose de una línea con account.`,
              details: { bytes, maxBytes: MAX_OUTPUT_BYTES },
            });
          }
        }
        return result;
      } catch (err) {
        return fail(err);
      }
    },
  },
];

/**
 * Helper para definir herramientas MCP con validación Zod y
 * mapeo de errores uniforme.
 */
import { z, type ZodTypeAny } from 'zod';
import type { ReportiaClient } from './client.js';
import { describeError, ReportiaError } from './errors.js';

/**
 * Definición común de una tool MCP.
 *
 * Las colecciones de tools se tipan como `ToolDefinition<any>[]` porque Zod
 * hace invariantes sus genéricos de entrada. El schema concreto sigue siendo
 * el que valida cada llamada en runtime.
 */
export interface ToolDefinition<TSchema extends z.AnyZodObject = z.AnyZodObject> {
  name: string;
  description: string;
  inputSchema: TSchema;
  /** Si true, la herramienta se considera destructiva y exige `confirm: true`. */
  destructive?: boolean;
  handler: (args: z.infer<TSchema>, ctx: ToolContext) => Promise<ToolResult>;
}

export type AnyToolDefinition = ToolDefinition<any>;

export interface ToolContext {
  client: ReportiaClient;
  /** ID de empresa por defecto configurado vía REPORTIA_COMPANY_ID. */
  defaultCompanyId: number | undefined;
}

export type ToolResult =
  | {
      ok: true;
      /** Texto devuelto al LLM (puede incluir JSON pretty-print). */
      content: string;
      /** Datos estructurados opcionales, útiles para tools que devuelven binarios. */
      data?: unknown;
    }
  | { ok: false; error: { code: string; message: string; details?: unknown } };

/** Convierte un Zod schema a JSON Schema-like para consumidores auxiliares. */
export function zodToInputShape(schema: z.AnyZodObject): Record<string, unknown> {
  const shape = schema.shape as Record<string, ZodTypeAny>;
  const properties: Record<string, unknown> = {};
  const required: string[] = [];
  for (const [k, v] of Object.entries(shape)) {
    const meta = describeZod(v);
    properties[k] = meta;
    if (!meta.optional) required.push(k);
  }
  const out: Record<string, unknown> = {
    type: 'object',
    properties,
  };
  if (required.length > 0) out.required = required;
  return out;
}

interface ZodMeta {
  type?: string;
  description?: string;
  optional?: boolean;
  default?: unknown;
  enum?: unknown[];
  items?: unknown;
  additionalProperties?: unknown;
  anyOf?: unknown[];
}

function describeZod(node: ZodTypeAny): ZodMeta {
  const description = node.description;
  let current: ZodTypeAny = node;
  let optional = false;
  let defaultValue: unknown = undefined;
  while (true) {
    const tn = (current._def as { typeName: string }).typeName;
    if (tn === 'ZodOptional') {
      optional = true;
      current = (current._def as { innerType: ZodTypeAny }).innerType;
    } else if (tn === 'ZodDefault') {
      const d = (current._def as { defaultValue: () => unknown }).defaultValue;
      defaultValue = typeof d === 'function' ? d() : d;
      current = (current._def as { innerType: ZodTypeAny }).innerType;
    } else {
      break;
    }
  }
  const tn = (current._def as { typeName: string }).typeName;
  const meta: ZodMeta = {};
  if (description) meta.description = description;
  if (optional) meta.optional = true;
  if (defaultValue !== undefined) meta.default = defaultValue;
  if (tn === 'ZodString') meta.type = 'string';
  else if (tn === 'ZodNumber') meta.type = 'number';
  else if (tn === 'ZodBoolean') meta.type = 'boolean';
  else if (tn === 'ZodEnum') {
    meta.type = 'string';
    meta.enum = (current._def as { values: unknown[] }).values;
  } else if (tn === 'ZodArray') {
    meta.type = 'array';
    meta.items = describeZod((current._def as { type: ZodTypeAny }).type);
  } else if (tn === 'ZodObject') {
    meta.type = 'object';
    const shape = (current._def as { shape: () => Record<string, ZodTypeAny> }).shape();
    meta.additionalProperties = false;
    const properties: Record<string, unknown> = {};
    const required: string[] = [];
    for (const [k, v] of Object.entries(shape)) {
      const m = describeZod(v);
      properties[k] = m;
      if (!m.optional) required.push(k);
    }
    (meta as Record<string, unknown>).properties = properties;
    if (required.length > 0) (meta as Record<string, unknown>).required = required;
  } else if (tn === 'ZodUnion') {
    const opts = (current._def as { options: ZodTypeAny[] }).options;
    meta.anyOf = opts.map((o) => describeZod(o));
  } else {
    meta.type = 'string';
  }
  return meta;
}

export function makeTool<TSchema extends z.AnyZodObject>(def: ToolDefinition<TSchema>): ToolDefinition<TSchema> {
  return def;
}

/** Resuelve el companyId del input o usa el default. */
export function resolveCompanyId(input: { companyId?: unknown }, ctx: ToolContext): number {
  const raw = input.companyId ?? ctx.defaultCompanyId;
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) {
    throw new ReportiaError({
      message:
        'Falta companyId. Proporciónalo en la llamada o configura REPORTIA_COMPANY_ID en el entorno.',
      code: 'MISSING_COMPANY_ID',
    });
  }
  return n;
}

/**
 * Valida que un string con formato YYYY-MM-DD represente una fecha real.
 * Evita que fechas imposibles como 2025-02-30, 2025-13-01 o 2025-00-15
 * pasen la validacion regex de Zod.
 */
export function isValidIsoDate(s: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12) return false;
  if (d < 1 || d > 31) return false;
  const date = new Date(Date.UTC(y, mo - 1, d));
  return (
    date.getUTCFullYear() === y &&
    date.getUTCMonth() === mo - 1 &&
    date.getUTCDate() === d
  );
}

/** Schema Zod reutilizable para fechas YYYY-MM-DD que rechaza fechas imposibles. */
export const IsoDateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, { message: 'Formato YYYY-MM-DD requerido' })
  .refine(isValidIsoDate, { message: 'Fecha invalida (ej: 2025-02-30, 2025-13-01)' });

/** Serializa el resultado de un handler a ToolResult exitoso. */
export function ok(data: unknown, asText?: string): ToolResult {
  if (asText) return { ok: true, content: asText, data };
  if (data === undefined || data === null) return { ok: true, content: '(sin contenido)' };
  if (typeof data === 'string') return { ok: true, content: data, data };
  return { ok: true, content: JSON.stringify(data, null, 2), data };
}

/** Mapea una excepción a ToolResult de error legible. */
export function fail(err: unknown): ToolResult {
  if (err instanceof ReportiaError) {
    return {
      ok: false,
      error: { code: err.code, message: describeError(err), details: redactDetails(err.details) },
    };
  }
  const msg = err instanceof Error ? err.message : String(err);
  return { ok: false, error: { code: 'UNEXPECTED', message: msg } };
}

/**
 * Redacta campos sensibles conocidos en un objeto de detalles antes
 * de devolverlos al LLM. Evita que errores del backend Reportia
 * (que podrian ecoar credenciales, tokens, cookies, etc.) terminen
 * en el contexto del LLM que invoca la tool.
 */
export function redactDetails(value: unknown, depth = 0): unknown {
  if (depth > 4 || value === null || value === undefined) return value;
  if (Array.isArray(value)) {
    return value.map((v) => redactDetails(v, depth + 1));
  }
  if (typeof value === 'object') {
    // Lista mas precisa: claves exactas o prefijos que SI son sensibles.
    // Evita sobre-redactar 'tokenUsage', 'cookieConsent', etc.
    const EXACT_SENSITIVE = /^(password|passwd|secret|token|apikey|api_key|authorization|cookie|set-cookie|x-api-key|smtppassword|smtp_password|access_token|refresh_token|sessionid|sid|jwt|bearer|private_key|privatekey)$/i;
    const PREFIX_SENSITIVE = /^(password|secret|token|apikey|api[-_]key|access[-_]token|refresh[-_]token|private[-_]?key)[-_]?$/i;
    const HEADER_SENSITIVE = /^(authorization|set-cookie|x-api-key)$/i;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (EXACT_SENSITIVE.test(k) || PREFIX_SENSITIVE.test(k) || HEADER_SENSITIVE.test(k)) {
        out[k] = '[REDACTED]';
      } else {
        out[k] = redactDetails(v, depth + 1);
      }
    }
    return out;
  }
  if (typeof value === 'string') {
    // Tira respuestas que parezcan headers HTTP crudos con secretos.
    if (/^(authorization|cookie|set-cookie):/im.test(value)) return '[REDACTED-HEADER]';
    return value;
  }
  return value;
}

/** Verifica la confirmación para tools destructivos. */
export function assertConfirmed(input: { confirm?: boolean }, toolName: string): void {
  if (input.confirm !== true) {
    throw new ReportiaError({
      message: `Operación destructiva '${toolName}' requiere { confirm: true }. Pídele al usuario confirmación explícita antes de invocarla.`,
      code: 'GUARD_REJECTED',
    });
  }
}

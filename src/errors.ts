/**
 * Errores estructurados que la capa cliente y las herramientas pueden
 * lanzar. Las herramientas los traducen a payloads JSON para que el
 * LLM que invoca el MCP reciba contexto útil.
 */

/**
 * Redactor de campos sensibles aplicado a `details` antes de exponerlo
 * al LLM. Evita dependencias circulares con tool-base.ts replicando
 * la logica minima aqui (los callers en tool-base.fail ya redactan;
 * esto cubre ReportiaError.toJSON()).
 */
function redactSensitive(value: unknown, depth = 0): unknown {
  if (depth > 4 || value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map((v) => redactSensitive(v, depth + 1));
  if (typeof value === 'object') {
    const EXACT_SENSITIVE = /^(password|passwd|secret|token|apikey|api_key|authorization|cookie|set-cookie|x-api-key|smtppassword|smtp_password|access_token|refresh_token|sessionid|sid|jwt|bearer|private_key|privatekey)$/i;
    const PREFIX_SENSITIVE = /^(password|secret|token|apikey|api[-_]key|access[-_]token|refresh[-_]token|private[-_]?key)[-_]?$/i;
    const HEADER_SENSITIVE = /^(authorization|set-cookie|x-api-key)$/i;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = (EXACT_SENSITIVE.test(k) || PREFIX_SENSITIVE.test(k) || HEADER_SENSITIVE.test(k))
        ? '[REDACTED]'
        : redactSensitive(v, depth + 1);
    }
    return out;
  }
  if (typeof value === 'string' && /^(authorization|cookie|set-cookie):/im.test(value)) {
    return '[REDACTED-HEADER]';
  }
  return value;
}

export class ReportiaError extends Error {
  readonly status: number | undefined;
  readonly code: string;
  readonly endpoint: string;
  readonly details: unknown;

  constructor(params: {
    message: string;
    code?: string;
    status?: number;
    endpoint?: string;
    details?: unknown;
  }) {
    super(params.message);
    this.name = this.constructor.name;
    this.status = params.status;
    this.code = params.code ?? 'REPORTIA_ERROR';
    this.endpoint = params.endpoint ?? '';
    this.details = params.details;
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      status: this.status,
      endpoint: this.endpoint,
      details: redactSensitive(this.details),
    };
  }
}

export class AuthError extends ReportiaError {
  constructor(message: string, endpoint = '', details?: unknown) {
    super({ message, code: 'AUTH_ERROR', status: 401, endpoint, details });
  }
}

export class NotFoundError extends ReportiaError {
  constructor(message: string, endpoint = '', details?: unknown) {
    super({ message, code: 'NOT_FOUND', status: 404, endpoint, details });
  }
}

export class ValidationError extends ReportiaError {
  constructor(message: string, endpoint = '', details?: unknown) {
    super({ message, code: 'VALIDATION_ERROR', status: 400, endpoint, details });
  }
}

export class RowLimitError extends ReportiaError {
  readonly totalRows: number | undefined;
  constructor(message: string, endpoint: string, totalRows?: number, details?: unknown) {
    super({ message, code: 'ROW_LIMIT_EXCEEDED', status: 422, endpoint, details });
    this.totalRows = totalRows;
  }
}

export class UnprocessableError extends ReportiaError {
  constructor(message: string, endpoint = '', details?: unknown) {
    super({ message, code: 'UNPROCESSABLE_ENTITY', status: 422, endpoint, details });
  }
}

export class NetworkError extends ReportiaError {
  constructor(message: string, endpoint = '', details?: unknown) {
    super({ message, code: 'NETWORK_ERROR', endpoint, details });
  }
}

export class TimeoutError extends ReportiaError {
  constructor(endpoint = '', timeoutMs?: number) {
    super({
      message: `Timeout al llamar a Reportia${timeoutMs ? ` tras ${timeoutMs}ms` : ''}`,
      code: 'TIMEOUT',
      endpoint,
      details: { timeoutMs },
    });
  }
}

export class GuardError extends ReportiaError {
  constructor(message: string) {
    super({ message, code: 'GUARD_REJECTED' });
  }
}

/** Traduce un error de Reportia en un mensaje legible. */
export function describeError(err: unknown): string {
  if (err instanceof ReportiaError) {
    return `${err.code}: ${err.message}${err.endpoint ? ` (endpoint=${err.endpoint})` : ''}`;
  }
  if (err instanceof Error) return err.message;
  return String(err);
}
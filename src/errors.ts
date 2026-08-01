/**
 * Errores estructurados que la capa cliente y las herramientas pueden
 * lanzar. Las herramientas los traducen a payloads JSON para que el
 * LLM que invoca el MCP reciba contexto útil.
 */
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
      details: this.details,
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
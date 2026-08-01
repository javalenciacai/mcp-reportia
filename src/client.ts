/**
 * Cliente HTTP que envuelve la API REST de Reportia.
 *
 * Caracteristicas:
 * - Soporta dos modos de autenticacion: sesion (cookie) o token Bearer.
 * - En modo sesion, realiza login perezoso en la primera llamada
 *   autenticada y reutiliza la cookie devuelta por /api/auth/login.
 * - Permite subir archivos (multipart/form-data) y descargar binarios
 *   (Excel/PDF) guardandolos en REPORTIA_DOWNLOAD_DIR.
 * - Aplica timeout por peticion via AbortController.
 * - Mapea errores HTTP a tipos estructurados (AuthError, NotFoundError,
 *   ValidationError, RowLimitError, NetworkError, TimeoutError).
 *
 * Disenado para ser consumido por las herramientas MCP. NO usa los
 * secretos de C:\\james\\Reportia\\.env: las credenciales se inyectan
 * desde variables de entorno.
 */
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { request, FormData, type Dispatcher } from 'undici';
import { Agent } from 'undici';

import type { AppConfig } from './config.js';
import {
  AuthError,
  NetworkError,
  NotFoundError,
  ReportiaError,
  RowLimitError,
  TimeoutError,
  ValidationError,
} from './errors.js';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface RequestOptions {
  method?: HttpMethod;
  query?: Record<string, string | number | boolean | undefined | null>;
  body?: unknown;
  /** FormData para multipart uploads (subida de archivos). */
  formData?: FormData;
  raw?: boolean;
  suggestedFileName?: string;
  timeoutMs?: number;
  headers?: Record<string, string>;
}

/** Re-export para que las tools/tools-consumers importen la misma FormData. */
export { FormData };

export interface DownloadResult {
  absolutePath: string;
  bytes: number;
  contentType: string | null;
  suggestedFileName: string;
}

export interface ClientDiagnostics {
  authMode: 'bearer' | 'session';
  baseUrl: string;
  hasSession: boolean;
  userId: number | null;
  downloadDir: string;
}

export interface ReportiaClient {
  readonly version: string;
  call<T = unknown>(endpoint: string, options?: RequestOptions): Promise<T>;
  download(endpoint: string, options?: RequestOptions): Promise<DownloadResult>;
  close(): Promise<void>;
  diagnostics(): ClientDiagnostics;
}

const CLIENT_VERSION = '0.1.0';

function safeMessage(body: string, json: unknown): string {
  if (json && typeof json === 'object' && 'message' in json) {
    const m = (json as { message?: unknown }).message;
    if (typeof m === 'string') return m;
  }
  return body.slice(0, 500) || 'Error HTTP';
}

export function createClient(config: AppConfig): ReportiaClient {
  const baseUrl = config.baseUrl.replace(/\/+$/, '');
  const agent = new Agent({ connections: 50, keepAliveTimeout: 30_000, keepAliveMaxTimeout: 60_000 });
  let cookie: string | null = null;
  let userId: number | null = null;
  let loginInFlight: Promise<void> | null = null;

  function buildUrl(endpoint: string, query?: RequestOptions['query']): URL {
    const u = new URL(
      endpoint.startsWith('http')
        ? endpoint
        : `${baseUrl}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`,
    );
    if (query) {
      for (const [k, v] of Object.entries(query)) {
        if (v !== undefined && v !== null) u.searchParams.set(k, String(v));
      }
    }
    return u;
  }

  function buildHeaders(extra?: Record<string, string>): Record<string, string> {
    const h: Record<string, string> = {
      Accept: 'application/json',
      'User-Agent': sanitizeUserAgent(config.userAgent),
    };
    if (config.authMode === 'bearer' && config.token) {
      h.Authorization = `Bearer ${config.token}`;
    } else if (cookie) {
      h.Cookie = cookie;
    }
    if (extra) Object.assign(h, extra);
    return h;
  }

  async function doLogin(): Promise<void> {
    if (!config.email || !config.password) {
      throw new AuthError('Faltan credenciales de sesion.');
    }
    const r = await rawFetch('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: config.email, password: config.password }),
      headers: { 'Content-Type': 'application/json' },
      skipSession: true,
    });
    const sc = r.headers['set-cookie'];
    if (sc) {
      const raw = Array.isArray(sc) ? sc[0] : sc;
      const match = /connect\.sid=[^;]+/.exec(raw);
      cookie = match ? match[0] : raw.split(';')[0];
    }
    if (r.json && typeof r.json === 'object') {
      const x = r.json as { user?: { externalUserId?: unknown }; userId?: unknown };
      const rawId = x.user?.externalUserId ?? x.userId;
      const parsed = Number(rawId);
      if (Number.isFinite(parsed)) userId = parsed;
    }
  }

  async function ensureSession(): Promise<void> {
    if (config.authMode !== 'session') return;
    if (cookie) return;
    if (!loginInFlight) {
      loginInFlight = doLogin().finally(() => {
        loginInFlight = null;
      });
    }
    await loginInFlight;
  }

  async function rawFetch(
    endpoint: string,
    opts: {
      method?: HttpMethod;
      body?: unknown;
      formData?: FormData;
      headers?: Record<string, string>;
      timeoutMs?: number;
      skipSession?: boolean;
    } = {},
  ): Promise<{ status: number; headers: Record<string, string | string[] | undefined>; body: Buffer; json: unknown }> {
    if (!opts.skipSession) await ensureSession();
    const timeoutMs = opts.timeoutMs ?? config.timeoutMs;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const h = buildHeaders(opts.headers);
      let body: string | FormData | undefined;
      if (opts.formData) {
        body = opts.formData;
      } else if (opts.body !== undefined) {
        body = typeof opts.body === 'string' ? opts.body : JSON.stringify(opts.body);
      }
      if (body instanceof FormData) {
        // undici pone el boundary correcto para multipart.
        delete h['Content-Type'];
      } else if (typeof body === 'string') {
        h['Content-Type'] = h['Content-Type'] ?? 'application/json';
      }

      // undici's RequestOptions expects `body` only on the second overload
      // (when `dispatcher` is provided). We construct a plain options object
      // and assign fields incrementally so we don't fight union narrowing.
      const init: {
        dispatcher: Dispatcher;
        method: Dispatcher.HttpMethod;
        headers: Record<string, string>;
        signal: AbortSignal;
        bodyTimeout: number;
        headersTimeout: number;
        body?: Dispatcher.RequestOptions['body'];
      } = {
        dispatcher: agent,
        method: (opts.method ?? 'GET') as Dispatcher.HttpMethod,
        headers: h,
        signal: controller.signal,
        bodyTimeout: timeoutMs,
        headersTimeout: timeoutMs,
      };
      if (body !== undefined) {
        init.body = body;
      }

      const url = buildUrl(endpoint);
      const res = await request(url, init);
      const buf = Buffer.from(await res.body.arrayBuffer());
      const headers = res.headers as Record<string, string | string[] | undefined>;

      const ct = stringHeader(headers['content-type']);
      let json: unknown = null;
      if (ct && /json/i.test(ct) && buf.length > 0) {
        try {
          json = JSON.parse(buf.toString('utf-8'));
        } catch {
          json = null;
        }
      }

      return { status: res.statusCode, headers, body: buf, json };
    } catch (e) {
      if (e instanceof ReportiaError) throw e;
      if ((e as { name?: string } | null)?.name === 'AbortError') {
        throw new TimeoutError(endpoint, timeoutMs);
      }
      const msg = e instanceof Error ? e.message : String(e);
      throw new NetworkError(`Fallo de red contra Reportia: ${msg}`, endpoint, e);
    } finally {
      clearTimeout(timer);
    }
  }

  async function call<T = unknown>(endpoint: string, opts: RequestOptions = {}): Promise<T> {
    const r = await rawFetch(endpoint, opts);
    if (r.status < 200 || r.status >= 300) {
      const msg = safeMessage(r.body.toString('utf-8'), r.json);
      throw mapHttpError(r.status, endpoint, msg, r.json);
    }
    if (opts.raw) return r.body as unknown as T;
    return (r.json as T) ?? (undefined as unknown as T);
  }

  async function download(endpoint: string, opts: RequestOptions = {}): Promise<DownloadResult> {
    const r = await rawFetch(endpoint, opts);
    if (r.status < 200 || r.status >= 300) {
      const msg = safeMessage(r.body.toString('utf-8'), r.json);
      throw mapHttpError(r.status, endpoint, msg, r.json);
    }
    await fs.mkdir(config.downloadDir, { recursive: true });

    let name = opts.suggestedFileName;
    const cd = stringHeader(r.headers['content-disposition']);
    const m = cd?.match(/filename\*?=(?:UTF-8'')?"?([^";]+)/i);
    if (!name && m && m[1]) name = decodeURIComponent(m[1]);
    if (!name) {
      const cleanPath = endpoint.replace(/[^\w./-]/g, '_');
      const base = path.basename(cleanPath) || 'reportia-export';
      name = `${base}.bin`;
    }
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const finalName = `${ts}__${path.basename(name)}`;
    const absolutePath = path.resolve(config.downloadDir, finalName);
    await fs.writeFile(absolutePath, r.body);
    return {
      absolutePath,
      bytes: r.body.length,
      contentType: stringHeader(r.headers['content-type']) ?? null,
      suggestedFileName: finalName,
    };
  }

  async function close(): Promise<void> {
    if (cookie) {
      try {
        await rawFetch('/api/auth/logout', { method: 'POST' });
      } catch {
        /* cerrar no debe fallar */
      }
    }
    try {
      await agent.close();
    } catch {
      /* noop */
    }
  }

  return {
    version: CLIENT_VERSION,
    call,
    download,
    close,
    diagnostics: () => ({
      authMode: config.authMode,
      baseUrl,
      hasSession: cookie !== null,
      userId,
      downloadDir: config.downloadDir,
    }),
  };
}

function stringHeader(v: string | string[] | undefined): string | undefined {
  if (v === undefined) return undefined;
  return Array.isArray(v) ? v[0] : v;
}

/**
 * Sanitiza un valor de cabecera HTTP eliminando CR/LF para impedir
 * inyeccion de cabeceras cuando el `User-Agent` viene de env vars
 * (caso extremo pero trivial de explotar contra un cliente HTTP
 * mal implementado). Si la cadena queda vacia, usa el default.
 */
function sanitizeUserAgent(value: string): string {
  const cleaned = value.replace(/[\r\n\t\v\f\0]/g, '').trim();
  if (!cleaned) return 'mcp-reportia/' + CLIENT_VERSION;
  return cleaned.slice(0, 256);
}

function mapHttpError(status: number, endpoint: string, msg: string, json: unknown): ReportiaError {
  if (status === 401 || status === 403) return new AuthError(msg, endpoint, json);
  if (status === 404) return new NotFoundError(msg, endpoint, json);
  if (status === 400) return new ValidationError(msg, endpoint, json);
  if (status === 422) {
    const totalRows = (json as { totalRows?: unknown } | null)?.totalRows;
    if (typeof totalRows === 'number') {
      return new RowLimitError(msg, endpoint, totalRows, json);
    }
  }
  return new ReportiaError({ message: msg, status, endpoint, details: json });
}
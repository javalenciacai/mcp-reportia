import { z } from 'zod';
import * as path from 'node:path';
import * as os from 'node:os';

const ConfigSchema = z.object({
  baseUrl: z.string().url(),
  email: z.string().email().optional(),
  password: z.string().min(1).optional(),
  token: z.string().min(1).optional(),
  /**
   * Pre-issued Reportia session cookie value (e.g. `connect.sid=s%3A...`)
   * to authenticate as the resolved user. Mutually exclusive with `token`
   * — supplying both is a config error to prevent silent precedence bugs.
   * Skips the email+password login dance entirely (no `POST /api/auth/login`
   * round trip), so it works for upstream callers that already hold the
   * user's session cookie (e.g. a per-run relay proxy) and just want
   * `mcp-reportia` to perform Reportia API calls on the user's behalf.
   */
  cookie: z.string().min(1).optional(),
  companyId: z.number().int().positive().optional(),
  timeoutMs: z.number().int().positive().default(30000),
  downloadDir: z.string().min(1),
  userAgent: z.string().min(1).default('mcp-reportia/0.1.0'),
  maxDownloadBytes: z.number().int().positive().default(100 * 1024 * 1024),
}).refine((v) => Boolean(v.token) || Boolean(v.email && v.password) || Boolean(v.cookie), { message: 'Configura REPORTIA_TOKEN, REPORTIA_EMAIL + REPORTIA_PASSWORD, o REPORTIA_COOKIE.' }).refine((v) => !(v.token && v.cookie), { message: 'REPORTIA_TOKEN y REPORTIA_COOKIE son mutuamente excluyentes — usa solo uno.' });

export type AppConfig = z.infer<typeof ConfigSchema> & { authMode: 'bearer' | 'session' | 'cookie' };
export class ConfigError extends Error { constructor(message: string) { super(message); this.name = 'ConfigError'; } }
function val(env: NodeJS.ProcessEnv, key: string): string | undefined { const v = env[key]; return v === undefined || v === '' ? undefined : v; }
function parseIntStrict(value: string | undefined, fallback: number): number {
  if (value === undefined || value === '') return fallback;
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const base = val(env, 'REPORTIA_BASE_URL');
  if (!base) throw new ConfigError('REPORTIA_BASE_URL es obligatorio.');
  const raw = {
    baseUrl: base.replace(/\/+$/, ''),
    email: val(env, 'REPORTIA_EMAIL'),
    password: val(env, 'REPORTIA_PASSWORD'),
    token: val(env, 'REPORTIA_TOKEN'),
    cookie: val(env, 'REPORTIA_COOKIE'),
    companyId: val(env, 'REPORTIA_COMPANY_ID') === undefined ? undefined : Number(val(env, 'REPORTIA_COMPANY_ID')),
    timeoutMs: parseIntStrict(val(env, 'REPORTIA_TIMEOUT_MS'), 30000),
    downloadDir: path.resolve(val(env, 'REPORTIA_DOWNLOAD_DIR') ?? path.join(process.cwd(), 'downloads')),
    userAgent: val(env, 'REPORTIA_USER_AGENT') ?? 'mcp-reportia/0.1.0',
    maxDownloadBytes: parseIntStrict(val(env, 'REPORTIA_MAX_DOWNLOAD_BYTES'), 100 * 1024 * 1024),
  };
  const parsed = ConfigSchema.safeParse(raw);
  if (!parsed.success) throw new ConfigError(parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n'));
  // Auth precedence: cookie > bearer > session (the reverse is unsafe — an
  // accidental REPORTIA_TOKEN in env would silently override a per-user
  // session cookie and the run would act as the wrong user). Callers that
  // want a strict mode can set `cookie === null` explicitly to disable the
  // bearer fallback.
  let authMode: 'bearer' | 'session' | 'cookie';
  if (parsed.data.cookie) authMode = 'cookie';
  else if (parsed.data.token) authMode = 'bearer';
  else authMode = 'session';
  return { ...parsed.data, authMode };
}
export function buildTestConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  const base = { baseUrl:'http://localhost:5000', token:'test-token', timeoutMs:5000, downloadDir:path.join(os.tmpdir(),'mcp-reportia-test'), userAgent:'mcp-reportia-test' };
  const p = ConfigSchema.parse({ ...base, ...overrides });
  let authMode: 'bearer' | 'session' | 'cookie';
  if (p.cookie) authMode = 'cookie';
  else if (p.token) authMode = 'bearer';
  else authMode = 'session';
  return { ...p, authMode };
}

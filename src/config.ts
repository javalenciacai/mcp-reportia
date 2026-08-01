import { z } from 'zod';
import * as path from 'node:path';
import * as os from 'node:os';

const ConfigSchema = z.object({
  baseUrl: z.string().url(),
  email: z.string().email().optional(),
  password: z.string().min(1).optional(),
  token: z.string().min(1).optional(),
  companyId: z.number().int().positive().optional(),
  timeoutMs: z.number().int().positive().default(30000),
  downloadDir: z.string().min(1),
  userAgent: z.string().min(1).default('mcp-reportia/0.1.0'),
}).refine((v) => Boolean(v.token) || Boolean(v.email && v.password), { message: 'Configura REPORTIA_TOKEN o REPORTIA_EMAIL + REPORTIA_PASSWORD.' });

export type AppConfig = z.infer<typeof ConfigSchema> & { authMode: 'bearer' | 'session' };
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
    companyId: val(env, 'REPORTIA_COMPANY_ID') === undefined ? undefined : Number(val(env, 'REPORTIA_COMPANY_ID')),
    timeoutMs: parseIntStrict(val(env, 'REPORTIA_TIMEOUT_MS'), 30000),
    downloadDir: path.resolve(val(env, 'REPORTIA_DOWNLOAD_DIR') ?? path.join(process.cwd(), 'downloads')),
    userAgent: val(env, 'REPORTIA_USER_AGENT') ?? 'mcp-reportia/0.1.0',
  };
  const parsed = ConfigSchema.safeParse(raw);
  if (!parsed.success) throw new ConfigError(parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n'));
  return { ...parsed.data, authMode: parsed.data.token ? 'bearer' : 'session' };
}
export function buildTestConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  const base = { baseUrl:'http://localhost:5000', token:'test-token', timeoutMs:5000, downloadDir:path.join(os.tmpdir(),'mcp-reportia-test'), userAgent:'mcp-reportia-test' };
  const p = ConfigSchema.parse({ ...base, ...overrides });
  return { ...p, authMode: p.token ? 'bearer' : 'session' };
}

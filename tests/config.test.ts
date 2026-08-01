/**
 * Tests unitarios para `loadConfig`.
 *
 * Verifican las invariantes de la validacion Zod sin tocar red
 * ni escribir en `process.env` real: se inyecta un env "limpio"
 * para cada caso.
 */

import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from '../src/config.js';

function makeEnv(overrides: Record<string, string | undefined> = {}) {
  const env: Record<string, string> = {
    REPORTIA_BASE_URL: 'http://localhost:5000',
    REPORTIA_TOKEN: 'test-token',
  };
  for (const [k, v] of Object.entries(overrides)) {
    if (v === undefined) delete env[k];
    else env[k] = v;
  }
  return env as NodeJS.ProcessEnv;
}

describe('loadConfig', () => {
  it('acepta configuracion minima con token bearer', () => {
    const cfg = loadConfig(makeEnv());
    expect(cfg.baseUrl).toBe('http://localhost:5000');
    expect(cfg.token).toBe('test-token');
    expect(cfg.authMode).toBe('bearer');
    expect(cfg.timeoutMs).toBe(30000);
    expect(cfg.downloadDir.endsWith('downloads')).toBe(true);
  });

  it('cambia authMode a session cuando no hay token pero si email+password', () => {
    const cfg = loadConfig(
      makeEnv({
        REPORTIA_TOKEN: undefined,
        REPORTIA_EMAIL: 'a@b.com',
        REPORTIA_PASSWORD: 'pw',
      }),
    );
    expect(cfg.authMode).toBe('session');
    expect(cfg.email).toBe('a@b.com');
    expect(cfg.password).toBe('pw');
    expect(cfg.token).toBeUndefined();
  });

  it('rechaza si falta baseUrl', () => {
    expect(() => loadConfig(makeEnv({ REPORTIA_BASE_URL: undefined }))).toThrowError(
      /REPORTIA_BASE_URL es obligatorio/,
    );
  });

  it('rechaza si no hay token ni email+password', () => {
    expect(() => loadConfig(makeEnv({ REPORTIA_TOKEN: undefined }))).toThrowError(ConfigError);
  });

  it('rechaza baseUrl sin formato de URL', () => {
    expect(() => loadConfig(makeEnv({ REPORTIA_BASE_URL: 'not-a-url' }))).toThrowError();
  });

  it('rechaza companyId no numerico', () => {
    expect(() =>
      loadConfig(makeEnv({ REPORTIA_COMPANY_ID: 'abc' })),
    ).toThrowError();
  });

  it('rechaza timeoutMs no positivo', () => {
    expect(() =>
      loadConfig(makeEnv({ REPORTIA_TIMEOUT_MS: '0' })),
    ).toThrowError();
  });

  it('normaliza trailing slash de baseUrl', () => {
    const cfg = loadConfig(
      makeEnv({ REPORTIA_BASE_URL: 'http://localhost:5000///' }),
    );
    expect(cfg.baseUrl).toBe('http://localhost:5000');
  });

  it('respeta REPORTIA_DOWNLOAD_DIR custom', () => {
    const cfg = loadConfig(
      makeEnv({ REPORTIA_DOWNLOAD_DIR: '/tmp/custom-reportia' }),
    );
    // En Windows la ruta se resuelve respecto a process.cwd().
    expect(cfg.downloadDir).toContain('custom-reportia');
  });

  it('parsea correctamente REPORTIA_COMPANY_ID numerico positivo', () => {
    const cfg = loadConfig(makeEnv({ REPORTIA_COMPANY_ID: '42' }));
    expect(cfg.companyId).toBe(42);
  });
});

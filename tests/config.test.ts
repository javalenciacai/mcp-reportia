/**
 * Tests unitarios para `loadConfig`.
 *
 * Verifican las invariantes de la validacion Zod sin tocar red
 * ni escribir en `process.env` real: se inyecta un env "limpio"
 * para cada caso.
 */

import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
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
    // Default robusto: tmpdir del SO + sufijo 'mcp-reportia' (no cwd/downloads,
    // que asume que process.cwd() es escribible y no lo es en containers
    // de produccion tipo /app). Cubre el bug EACCES de la sesion 2026-09-10
    // donde REPORTIA_DOWNLOAD_DIR no llego al container del MCP.
    expect(cfg.downloadDir.endsWith('mcp-reportia')).toBe(true);
    expect(path.isAbsolute(cfg.downloadDir)).toBe(true);
  });

  it('default de downloadDir es escribible sin necesidad de REPORTIA_DOWNLOAD_DIR', async () => {
    // RED test: el default DEBE ser escribible en cualquier sistema (no depender
    // de que el cwd sea escribible, como pasaba con process.cwd()/downloads
    // que fallo con EACCES en el container del MCP de Cowork.CTis).
    const cfg = loadConfig(makeEnv());
    await expect(fs.mkdir(cfg.downloadDir, { recursive: true })).resolves.not.toThrow();
    const probe = path.join(cfg.downloadDir, `probe-${Date.now()}.txt`);
    await expect(fs.writeFile(probe, 'ok')).resolves.not.toThrow();
    await expect(fs.unlink(probe)).resolves.not.toThrow();
    await expect(fs.rmdir(cfg.downloadDir)).resolves.not.toThrow();
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

  it('cambia authMode a cookie cuando REPORTIA_COOKIE esta presente (sesion resuelta por el caller)', () => {
    const cfg = loadConfig(
      makeEnv({
        REPORTIA_TOKEN: undefined,
        REPORTIA_EMAIL: undefined,
        REPORTIA_PASSWORD: undefined,
        REPORTIA_COOKIE: 'connect.sid=s%3Atest-cookie-value',
      }),
    );
    expect(cfg.authMode).toBe('cookie');
    expect(cfg.cookie).toBe('connect.sid=s%3Atest-cookie-value');
    expect(cfg.token).toBeUndefined();
  });

  it('cookie tiene precedencia sobre token cuando ambos estan presentes — fallo explicito', () => {
    // Las dos a la vez es un error de config (sin precedencia silenciosa);
    // un REPORTIA_TOKEN accidental en el env no debe sobreescribir la
    // sesion per-user que el caller resolvio explicitamente.
    expect(() =>
      loadConfig(
        makeEnv({
          REPORTIA_TOKEN: 'service-token-should-not-be-honored',
          REPORTIA_COOKIE: 'connect.sid=s%3Aper-user-cookie',
        }),
      ),
    ).toThrowError(/mutuamente excluyentes/);
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

  it('respeta REPORTIA_DOWNLOAD_DIR custom', async () => {
    // El test usa un subdirectorio del tmpdir (siempre escribible) para
    // verificar que REPORTIA_DOWNLOAD_DIR se respeta cuando esta seteada.
    // En produccion el caller debe apuntarlo a un path que EXISTA y sea
    // escribible por el proceso del MCP — sino fs.mkdir va a fallar con
    // EACCES o ENOENT al primer download, no en loadConfig.
    const customDir = path.join(os.tmpdir(), `mcp-reportia-test-${Date.now()}`);
    const cfg = loadConfig(
      makeEnv({ REPORTIA_DOWNLOAD_DIR: customDir }),
    );
    expect(cfg.downloadDir).toBe(customDir);
    // Verifica que efectivamente se puede escribir ahi (no es solo config,
    // es que el path funciona end-to-end).
    await expect(fs.mkdir(cfg.downloadDir, { recursive: true })).resolves.not.toThrow();
    const probe = path.join(cfg.downloadDir, 'probe.txt');
    await expect(fs.writeFile(probe, 'ok')).resolves.not.toThrow();
    await fs.unlink(probe);
    await fs.rmdir(cfg.downloadDir);
  });

  it('REPORTIA_DOWNLOAD_DIR a path invalido: falla tarde con error claro, no en loadConfig', () => {
    // loadConfig NO valida que el path exista o sea escribible — eso es
    // intencional: en containers no podemos saber el FS state al boot.
    // El error llega al primer download (fs.mkdir con recursive:true) y
    // queda envuelto por ReportiaError con el mensaje del FS.
    // Este test documenta que loadConfig no falla por un path invalido.
    const cfg = loadConfig(
      makeEnv({ REPORTIA_DOWNLOAD_DIR: '/this/path/does/not/exist/and/cant/be/created' }),
    );
    // En Windows, path.resolve normaliza los slashes a backslashes. Solo
    // verificamos que el path fue aceptado (no rechazado) por loadConfig;
    // la existencia real se valida cuando fs.mkdir intenta crear el dir.
    expect(cfg.downloadDir).toContain('does');
    expect(cfg.downloadDir).toContain('not');
    expect(cfg.downloadDir).toContain('exist');
  });

  it('parsea correctamente REPORTIA_COMPANY_ID numerico positivo', () => {
    const cfg = loadConfig(makeEnv({ REPORTIA_COMPANY_ID: '42' }));
    expect(cfg.companyId).toBe(42);
  });
});

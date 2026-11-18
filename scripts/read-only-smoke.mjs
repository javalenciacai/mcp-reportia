#!/usr/bin/env node
/**
 * Smoke del perfil de solo lectura (HU-0 · T0-07 y T0-08), a nivel de proceso.
 *
 *  1) REPORTIA_READ_ONLY=true  -> initialize + tools/list = las 37 tools de
 *     `read-only-tools.json`, en ese conjunto exacto.
 *  2) REPORTIA_READ_ONLY=yes   -> el proceso sale con código 1 sin abrir stdio
 *     (nada en stdout) y con un error de configuración legible en stderr.
 *
 * Sin red: REPORTIA_BASE_URL apunta a un puerto cerrado y el token es ficticio.
 * Exit 0 si todo OK, 1 si algo falla.
 */
import { spawn, spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const entry = path.join(root, 'dist', 'server.js');
const expected = JSON.parse(fs.readFileSync(path.join(root, 'read-only-tools.json'), 'utf8')).tools;
const baseEnv = {
  ...process.env,
  REPORTIA_BASE_URL: 'http://127.0.0.1:9',
  REPORTIA_TOKEN: 'smoke-token',
  REPORTIA_DOWNLOAD_DIR: path.join(root, '.smoke-downloads'),
};
delete baseEnv.REPORTIA_COMPANY_ID;

function fail(msg) {
  process.stdout.write(`[read-only-smoke] FALLO: ${msg}\n`);
  process.exit(1);
}

// 2) valor inválido: no arranca.
const bad = spawnSync(process.execPath, [entry], {
  env: { ...baseEnv, REPORTIA_READ_ONLY: 'yes' },
  encoding: 'utf8',
  timeout: 8000,
  input: '',
});
if (bad.status !== 1) fail(`REPORTIA_READ_ONLY=yes debía salir con código 1 y salió con ${bad.status}`);
if (bad.stdout.length > 0) fail('REPORTIA_READ_ONLY=yes escribió en stdout (no debía abrir stdio)');
if (!/REPORTIA_READ_ONLY/.test(bad.stderr)) fail('el error de configuración no nombra REPORTIA_READ_ONLY');
process.stdout.write('[read-only-smoke] OK: valor inválido impide arrancar (código 1, stdout vacío)\n');

// 1) perfil activo: 37 tools.
const child = spawn(process.execPath, [entry], {
  env: { ...baseEnv, REPORTIA_READ_ONLY: 'true' },
  stdio: ['pipe', 'pipe', 'pipe'],
});
let buf = '';
const waiters = new Map();
child.stdout.on('data', (c) => {
  buf += c.toString('utf8');
  let i;
  while ((i = buf.indexOf('\n')) !== -1) {
    const line = buf.slice(0, i);
    buf = buf.slice(i + 1);
    if (!line.trim()) continue;
    try {
      const m = JSON.parse(line);
      waiters.get(m.id)?.(m);
    } catch { /* no-json */ }
  }
});
const request = (id, method, params = {}) =>
  new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout en ${method}`)), 8000);
    waiters.set(id, (m) => { clearTimeout(t); resolve(m); });
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
  });

try {
  const init = await request(1, 'initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'read-only-smoke', version: '0.0.0' },
  });
  if (init.error) throw new Error('initialize: ' + JSON.stringify(init.error));
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
  const list = await request(2, 'tools/list');
  const names = (list.result?.tools ?? []).map((t) => t.name);
  if (names.length !== 37) throw new Error(`tools/list devolvió ${names.length} tools, se esperaban 37`);
  if (JSON.stringify([...names].sort()) !== JSON.stringify(expected)) {
    throw new Error('tools/list no coincide con read-only-tools.json');
  }
  process.stdout.write(`[read-only-smoke] OK: tools/list devolvio ${names.length} herramientas (perfil de solo lectura)\n`);
  child.kill();
  process.exit(0);
} catch (e) {
  child.kill();
  fail(e instanceof Error ? e.message : String(e));
}

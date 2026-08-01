#!/usr/bin/env node
/**
 * Smoke test del servidor MCP (stdio / newline-JSON framing).
 *
 * Lanza `dist/server.js` como subproceso, le envia dos mensajes
 * JSON-RPC (`initialize` y `tools/list`) y verifica que:
 *   1) El subproceso se inicia sin credenciales reales.
 *   2) Responde `initialize` con `serverInfo.name === 'mcp-reportia'`.
 *   3) Responde `tools/list` con un arreglo no vacio de tools.
 *
 * No realiza llamadas HTTP contra Reportia: `REPORTIA_BASE_URL`
 * apunta a 127.0.0.1:9 (puerto cerrado) y el token es ficticio.
 * El servidor solo necesita una configuracion valida para arrancar;
 * las tools reales haran sus propias llamadas al ser invocadas.
 *
 * Salida:
 *   - Imprime resumen en stdout.
 *   - Exit 0 si todo OK, 1 si falla.
 */

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as path from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const serverEntry = path.resolve(__dirname, '..', 'dist', 'server.js');

const ENV = {
  ...process.env,
  REPORTIA_BASE_URL: 'http://127.0.0.1:9',
  REPORTIA_TOKEN: 'smoke-token',
  // Evita que cargar config trate de leer CWD del usuario real.
  REPORTIA_DOWNLOAD_DIR: path.join(__dirname, '..', '.smoke-downloads'),
};

/** Escribe un mensaje JSON-RPC (un solo '\n' como separador, segun el SDK). */
function send(child, msg) {
  child.stdin.write(JSON.stringify(msg) + '\n');
}

function logSection(title) {
  process.stdout.write(`\n=== ${title} ===\n`);
}

async function main() {
  logSection('Smoke test MCP (stdio)');
  process.stdout.write(`Servidor: ${serverEntry}\n`);

  const child = spawn(process.execPath, [serverEntry], {
    env: ENV,
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  let stdoutBuf = '';
  let stderrBuf = '';
  let resolved = false;
  let rejected = null;
  /** @type {Map<string, (msg: any) => void>} */
  const pending = new Map();

  child.stdout.on('data', (chunk) => {
    stdoutBuf += chunk.toString('utf8');
    let idx;
    while ((idx = stdoutBuf.indexOf('\n')) !== -1) {
      const line = stdoutBuf.slice(0, idx);
      stdoutBuf = stdoutBuf.slice(idx + 1);
      if (!line.trim()) continue;
      let parsed;
      try {
        parsed = JSON.parse(line);
      } catch (e) {
        process.stdout.write(`[smoke] (no-json) ${line}\n`);
        continue;
      }
      const id = parsed?.id;
      if (typeof id === 'string' || typeof id === 'number') {
        const resolver = pending.get(String(id));
        if (resolver) {
          pending.delete(String(id));
          resolver(parsed);
        }
      }
    }
  });

  child.stderr.on('data', (chunk) => {
    stderrBuf += chunk.toString('utf8');
  });

  child.on('error', (err) => {
    rejected = err;
  });

  child.on('exit', (code, signal) => {
    process.stdout.write(`[smoke] subproceso salio code=${code} signal=${signal}\n`);
    if (!resolved) {
      resolved = true;
      if (!rejected) {
        rejected = new Error(`El servidor MCP termino prematuramente (code=${code}). stderr=${stderrBuf}`);
      }
    }
  });

  /** Envia un request JSON-RPC y espera la respuesta con ese id. */
  function request(method, params = {}) {
    const id = `smoke-${Math.random().toString(36).slice(2)}`;
    const msg = { jsonrpc: '2.0', id, method, params };
    return new Promise((resolveResp, rejectResp) => {
      const t = setTimeout(() => {
        pending.delete(String(id));
        rejectResp(new Error(`Timeout esperando respuesta a ${method}`));
      }, 8000);
      pending.set(String(id), (resp) => {
        clearTimeout(t);
        resolveResp(resp);
      });
      send(child, msg);
    });
  }

  try {
    // 1) initialize (requerido por el protocolo MCP).
    logSection('initialize');
    const initResp = await request('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'mcp-reportia-smoke', version: '0.0.0' },
    });
    process.stdout.write(JSON.stringify(initResp, null, 2) + '\n');
    if (initResp.error) {
      throw new Error('initialize devolvio error: ' + JSON.stringify(initResp.error));
    }
    if (initResp.result?.serverInfo?.name !== 'mcp-reportia') {
      throw new Error('serverInfo.name inesperado: ' + JSON.stringify(initResp.result?.serverInfo));
    }

    // 2) initialized notification (no espera respuesta).
    send(child, { jsonrpc: '2.0', method: 'notifications/initialized' });

    // 3) tools/list.
    logSection('tools/list');
    const listResp = await request('tools/list', {});
    process.stdout.write(JSON.stringify({ ...listResp, result: { ...(listResp.result ?? {}), tools: `<${listResp.result?.tools?.length ?? 0} tools>` } }, null, 2) + '\n');
    if (listResp.error) {
      throw new Error('tools/list devolvio error: ' + JSON.stringify(listResp.error));
    }
    const tools = listResp.result?.tools;
    if (!Array.isArray(tools) || tools.length === 0) {
      throw new Error('tools/list devolvio una lista vacia o no es un array.');
    }
    process.stdout.write(`\n[smoke] OK: tools/list devolvio ${tools.length} herramientas.\n`);
    for (const t of tools) {
      process.stdout.write(`  - ${t.name}\n`);
    }

    // Cierre ordenado.
    send(child, { jsonrpc: '2.0', id: 'smoke-shutdown', method: 'shutdown' });
    setTimeout(() => {
      try { child.kill(); } catch { /* noop */ }
    }, 500);

    resolved = true;
    if (rejected) throw rejected;
    process.exit(0);
  } catch (err) {
    process.stdout.write(`\n[smoke] FALLO: ${err && err.stack ? err.stack : err}\n`);
    process.stdout.write(`[smoke] stderr capturado:\n${stderrBuf}\n`);
    try { child.kill(); } catch { /* noop */ }
    process.exit(1);
  }
}

main().catch((e) => {
  process.stderr.write(`[smoke] error fatal: ${e?.stack ?? e}\n`);
  process.exit(1);
});

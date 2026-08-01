/**
 * Smoke de integracion contra un servidor Reportia REAL.
 *
 * Configuracion:
 *   REPORTIA_BASE_URL  URL real del servidor (sin trailing slash)
 *   REPORTIA_TOKEN     Token bearer a probar (puede ser fake)
 *
 * Comportamiento:
 *   - initialize + tools/list: nunca falla
 *   - reportia_health: hace ping a /api/health (sin auth)
 *   - reportia_whoami: con token fake deberia devolver error AUTH_ERROR
 *
 * Salida: imprime resumen en stdout, exit 0 si el handshake MCP funciona.
 */
import { spawn } from 'node:child_process';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverEntry = process.argv[2];
const baseUrl = process.argv[3] || 'https://reportia.ctisevolution.com/';
const token = process.argv[4] || 'integration-smoke-fake-token';

if (!serverEntry) {
  console.error('Uso: node integration-smoke.mjs <server.js> [baseUrl] [token]');
  process.exit(2);
}

const child = spawn(process.execPath, [serverEntry], {
  env: { ...process.env, REPORTIA_BASE_URL: baseUrl, REPORTIA_TOKEN: token },
  stdio: ['pipe', 'pipe', 'pipe'],
});

let stdout = '', stderr = '';
child.stdout.on('data', (c) => { stdout += c; });
child.stderr.on('data', (c) => { stderr += c; });

function send(msg) { child.stdin.write(JSON.stringify(msg) + '\n'); }

function request(method, params) {
  const id = 'int-' + Math.random().toString(36).slice(2);
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout ' + method)), 25000);
    const onData = (chunk) => {
      const lines = chunk.toString().split('\n').filter(Boolean);
      for (const line of lines) {
        try {
          const r = JSON.parse(line);
          if (r.id === id) {
            child.stdout.off('data', onData);
            clearTimeout(t);
            resolve(r);
            return;
          }
        } catch { /* ignore */ }
      }
    };
    child.stdout.on('data', onData);
    send({ jsonrpc: '2.0', id, method, params });
  });
}

(async () => {
  try {
    // 1) initialize
    const init = await request('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'integration-smoke', version: '0.0.0' },
    });
    console.log('initialize:', init.result?.serverInfo?.name, 'v' + init.result?.serverInfo?.version);

    // 2) notifications/initialized (no espera respuesta)
    send({ jsonrpc: '2.0', method: 'notifications/initialized' });

    // 3) tools/list
    const list = await request('tools/list', {});
    console.log('tools/list count:', list.result?.tools?.length);

    // 4) reportia_health (no requiere auth valida)
    const health = await request('tools/call', { name: 'reportia_health', arguments: {} });
    const healthText = health.result?.content?.[0]?.text || '';
    const healthParsed = (() => { try { return JSON.parse(healthText); } catch { return { raw: healthText.slice(0, 200) }; } })();
    console.log('reportia_health:');
    console.log('  isError:', !!health.result?.isError);
    console.log('  api.status:', healthParsed.api?.status || healthParsed.api?.error || '?');
    console.log('  client.authMode:', healthParsed.client?.authMode);
    console.log('  client.baseUrl:', healthParsed.client?.baseUrl);

    // 5) reportia_whoami con token fake (esperamos error controlado)
    const who = await request('tools/call', { name: 'reportia_whoami', arguments: {} });
    const whoText = who.result?.content?.[0]?.text || '';
    let whoCode = '?';
    try { whoCode = JSON.parse(whoText).code; } catch { whoCode = whoText.slice(0, 80); }
    console.log('reportia_whoami (fake token):');
    console.log('  isError:', !!who.result?.isError);
    console.log('  error.code:', whoCode);
    console.log('  [esperado: AUTH_ERROR con token invalido]');

    console.log('\nOK: handshake MCP + integracion con servidor real completados.');
  } catch (e) {
    console.error('FAIL:', e.message);
    console.error('STDERR (inicio):', stderr.slice(0, 500));
    process.exitCode = 1;
  } finally {
    try { child.kill(); } catch { /* noop */ }
    setTimeout(() => process.exit(process.exitCode || 0), 200);
  }
})();
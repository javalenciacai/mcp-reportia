/**
 * Smoke de integracion contra un servidor Reportia de PRUEBA, local.
 *
 * Este script levanta su propio mock HTTP en 127.0.0.1 (puerto libre que
 * asigna el SO) y lo cierra al terminar. Nunca llama a la API real de
 * Reportia: no hay URL de produccion por defecto, y si se pasa una URL
 * explicita que no sea loopback, el script falla cerrado sin arrancar nada
 * (ni el mock ni el servidor MCP).
 *
 * Configuracion (todo opcional):
 *   argv[2]  Ruta al entry point del servidor MCP (dist/server.js)
 *   argv[3]  URL base a usar en vez del mock propio — DEBE ser loopback
 *            (127.0.0.1 / localhost / [::1]); cualquier otro valor aborta.
 *   argv[4]  Token bearer a probar (por defecto uno fake)
 *
 * Comportamiento:
 *   - initialize + tools/list: nunca falla
 *   - reportia_health: hace ping a /api/health del mock (sin auth)
 *   - reportia_whoami: con token fake, el mock devuelve 401 y la tool
 *     deberia traducirlo a AUTH_ERROR
 *
 * Salida: imprime resumen en stdout, exit 0 si el handshake MCP funciona.
 */
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';

const serverEntry = process.argv[2];
const explicitBaseUrl = process.argv[3];
const token = process.argv[4] || 'integration-smoke-fake-token';

if (!serverEntry) {
  console.error('Uso: node integration-smoke.mjs <server.js> [baseUrl loopback] [token]');
  process.exit(2);
}

/** Solo 127.0.0.1 / localhost / ::1 cuentan como loopback. Fail-closed en cualquier otro caso. */
function isLoopbackUrl(value) {
  let u;
  try {
    u = new URL(value);
  } catch {
    return false;
  }
  const host = u.hostname.replace(/^\[|\]$/g, '');
  return host === '127.0.0.1' || host === 'localhost' || host === '::1';
}

if (explicitBaseUrl && !isLoopbackUrl(explicitBaseUrl)) {
  console.error(
    `FAIL: "${explicitBaseUrl}" no es una URL loopback. test:integration nunca llama a la API real de Reportia; usa 127.0.0.1/localhost o no pases baseUrl (el script levanta su propio mock).`,
  );
  process.exit(2);
}

/** Mock minimo de Reportia: solo lo que esta prueba toca. */
function startMockReportia() {
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      if (req.method === 'GET' && req.url === '/api/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok' }));
        return;
      }
      if (req.method === 'GET' && req.url === '/api/auth/me') {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ message: 'Sesion invalida (mock de integracion).' }));
        return;
      }
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: 'not found (mock de integracion)' }));
    });
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

function send(child, msg) {
  child.stdin.write(JSON.stringify(msg) + '\n');
}

function request(child, method, params) {
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
        } catch {
          /* ignore */
        }
      }
    };
    child.stdout.on('data', onData);
    send(child, { jsonrpc: '2.0', id, method, params });
  });
}

(async () => {
  let mock = null;
  let child = null;
  let stderr = '';
  try {
    mock = explicitBaseUrl ? null : await startMockReportia();
    const baseUrl = explicitBaseUrl || `http://127.0.0.1:${mock.address().port}`;
    console.log('test:integration contra mock local:', baseUrl);

    child = spawn(process.execPath, [serverEntry], {
      env: { ...process.env, REPORTIA_BASE_URL: baseUrl, REPORTIA_TOKEN: token },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    child.stderr.on('data', (c) => {
      stderr += c;
    });

    // 1) initialize
    const init = await request(child, 'initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'integration-smoke', version: '0.0.0' },
    });
    console.log('initialize:', init.result?.serverInfo?.name, 'v' + init.result?.serverInfo?.version);

    // 2) notifications/initialized (no espera respuesta)
    send(child, { jsonrpc: '2.0', method: 'notifications/initialized' });

    // 3) tools/list
    const list = await request(child, 'tools/list', {});
    console.log('tools/list count:', list.result?.tools?.length);

    // 4) reportia_health (no requiere auth valida)
    const health = await request(child, 'tools/call', { name: 'reportia_health', arguments: {} });
    const healthText = health.result?.content?.[0]?.text || '';
    const healthParsed = (() => {
      try {
        return JSON.parse(healthText);
      } catch {
        return { raw: healthText.slice(0, 200) };
      }
    })();
    console.log('reportia_health:');
    console.log('  isError:', !!health.result?.isError);
    console.log('  api.status:', healthParsed.api?.status || healthParsed.api?.error || '?');
    console.log('  client.authMode:', healthParsed.client?.authMode);
    console.log('  client.baseUrl:', healthParsed.client?.baseUrl);

    // 5) reportia_whoami con token fake (esperamos error controlado)
    const who = await request(child, 'tools/call', { name: 'reportia_whoami', arguments: {} });
    const whoText = who.result?.content?.[0]?.text || '';
    let whoCode = '?';
    try {
      whoCode = JSON.parse(whoText).code;
    } catch {
      whoCode = whoText.slice(0, 80);
    }
    console.log('reportia_whoami (fake token):');
    console.log('  isError:', !!who.result?.isError);
    console.log('  error.code:', whoCode);
    console.log('  [esperado: AUTH_ERROR con token invalido]');

    console.log('\nOK: handshake MCP + integracion con el mock local completados.');
  } catch (e) {
    console.error('FAIL:', e.message);
    if (stderr) console.error('STDERR (inicio):', stderr.slice(0, 500));
    process.exitCode = 1;
  } finally {
    try {
      child?.kill();
    } catch {
      /* noop */
    }
    await new Promise((resolve) => {
      if (!mock) return resolve();
      mock.close(() => resolve());
    });
    setTimeout(() => process.exit(process.exitCode || 0), 200);
  }
})();

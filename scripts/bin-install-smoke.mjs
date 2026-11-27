#!/usr/bin/env node
/**
 * Smoke test de instalacion: el COMANDO publicado (`npm pack` + `npm install`
 * en un directorio limpio) debe arrancar el servidor MCP, no solo
 * `node dist/server.js` ejecutado directamente dentro del repo.
 *
 * Cubre tres caminos de arranque sobre un paquete instalado desde tarball:
 *   (a) el enlace simbolico que npm crea en `node_modules/.bin/<bin>`
 *   (b) `npx --no-install <bin>` (resuelve el mismo enlace, sin red)
 *   (c) `node dist/server.js` dentro del paquete instalado
 *
 * Para cada uno, envia `initialize` por stdio y exige una respuesta con
 * `serverInfo.name === 'mcp-reportia'` y `serverInfo.version` igual a la
 * version de `package.json` empaquetada. Falla cerrado (exit != 0) con un
 * mensaje claro senalando que camino no respondio.
 *
 * Sin red: REPORTIA_BASE_URL apunta a un puerto cerrado en 127.0.0.1 y las
 * credenciales son ficticias; `initialize` no hace ninguna llamada HTTP.
 */
import { spawn, spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

function logSection(title) {
  process.stdout.write(`\n=== ${title} ===\n`);
}

function fail(msg) {
  process.stdout.write(`\n[bin-install-smoke] FALLO: ${msg}\n`);
  process.exit(1);
}

function run(cmd, args, opts) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', ...opts });
  if (r.error) fail(`no se pudo ejecutar "${cmd} ${args.join(' ')}": ${r.error.message}`);
  if (r.status !== 0) {
    fail(
      `"${cmd} ${args.join(' ')}" salio con codigo ${r.status}.\nstdout:\n${r.stdout}\nstderr:\n${r.stderr}`,
    );
  }
  return r;
}

/**
 * Lanza `command args` como subproceso, le envia `initialize` y espera la
 * respuesta JSON-RPC. Falla si el proceso no responde o sale antes.
 */
function initializeCheck(label, command, args, cwd, env) {
  logSection(label);
  process.stdout.write(`comando: ${command} ${args.join(' ')} (cwd=${cwd})\n`);

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, env, stdio: ['pipe', 'pipe', 'pipe'] });

    let stdoutBuf = '';
    let stderrBuf = '';
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try { child.kill(); } catch { /* noop */ }
      reject(new Error(`[${label}] timeout esperando respuesta a initialize. stderr=${stderrBuf} stdout=${stdoutBuf}`));
    }, 8000);

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
        } catch {
          continue;
        }
        if (parsed && parsed.id === 'bin-smoke-init') {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          try { child.kill(); } catch { /* noop */ }
          resolve(parsed);
        }
      }
    });

    child.stderr.on('data', (chunk) => {
      stderrBuf += chunk.toString('utf8');
    });

    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new Error(`[${label}] no se pudo lanzar el proceso: ${err.message}`));
    });

    child.on('exit', (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(
        new Error(
          `[${label}] el proceso salio antes de responder a initialize (code=${code}, signal=${signal}). ` +
            `stdout=[${stdoutBuf}] stderr=[${stderrBuf}]`,
        ),
      );
    });

    child.stdin.write(
      JSON.stringify({
        jsonrpc: '2.0',
        id: 'bin-smoke-init',
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'bin-install-smoke', version: '0.0.0' },
        },
      }) + '\n',
    );
  });
}

async function main() {
  logSection('bin-install-smoke: build + pack + install limpio');

  // 1) build (deja dist/ al dia con el src actual).
  run('npm', ['run', 'build'], { cwd: root, stdio: 'pipe' });

  // 2) pack: tarball en un directorio temporal, nunca en el repo.
  //    BIN_SMOKE_TMPDIR permite forzar la base (p.ej. fuera de /tmp
  //    durante pruebas manuales); por defecto usa el tmp del SO, como hace
  //    cualquier runner de CI.
  const tmpParent = process.env.BIN_SMOKE_TMPDIR
    ? fs.mkdtempSync(path.join(fs.realpathSync(process.env.BIN_SMOKE_TMPDIR), 'bin-install-smoke-'))
    : fs.mkdtempSync(path.join(os.tmpdir(), 'bin-install-smoke-'));
  const packDir = path.join(tmpParent, 'pack');
  const installDir = path.join(tmpParent, 'install');
  fs.mkdirSync(packDir, { recursive: true });
  fs.mkdirSync(installDir, { recursive: true });

  const packOut = run('npm', ['pack', '--silent', '--pack-destination', packDir], { cwd: root });
  const tarballName = packOut.stdout.trim().split('\n').pop();
  if (!tarballName || !tarballName.endsWith('.tgz')) {
    fail(`"npm pack" no devolvio un nombre de tarball reconocible: ${JSON.stringify(packOut.stdout)}`);
  }
  const tarballPath = path.join(packDir, tarballName);
  process.stdout.write(`tarball: ${tarballPath}\n`);

  // 3) instalar el tarball en un directorio limpio, SIN el repo como workspace.
  fs.writeFileSync(
    path.join(installDir, 'package.json'),
    JSON.stringify({ name: 'mcp-reportia-bin-smoke-install', private: true, version: '0.0.0' }, null, 2),
  );
  run('npm', ['install', tarballPath, '--no-audit', '--no-fund', '--silent'], { cwd: installDir });

  const [scope, ...rest] = pkg.name.split('/');
  const pkgDirInNodeModules = pkg.name.startsWith('@')
    ? path.join(installDir, 'node_modules', scope, rest.join('/'))
    : path.join(installDir, 'node_modules', pkg.name);
  const binName = Object.keys(pkg.bin ?? {})[0];
  if (!binName) fail('package.json no define "bin".');
  const binPath = path.join(installDir, 'node_modules', '.bin', binName);
  const serverJsPath = path.join(pkgDirInNodeModules, 'dist', 'server.js');

  if (!fs.existsSync(binPath)) fail(`no se creo el enlace del bin esperado: ${binPath}`);
  if (!fs.existsSync(serverJsPath)) fail(`no se instalo dist/server.js en: ${serverJsPath}`);

  const childEnv = {
    ...process.env,
    REPORTIA_BASE_URL: 'http://127.0.0.1:9',
    REPORTIA_EMAIL: 'smoke@example.com',
    REPORTIA_PASSWORD: 'smoke-password',
    REPORTIA_DOWNLOAD_DIR: path.join(tmpParent, '.smoke-downloads'),
  };
  delete childEnv.REPORTIA_TOKEN;
  delete childEnv.REPORTIA_COOKIE;

  const checks = [
    [`(a) bin simbolico: node_modules/.bin/${binName}`, binPath, []],
    [`(b) npx local --no-install ${binName}`, 'npx', ['--no-install', binName]],
    ['(c) node dist/server.js instalado', process.execPath, [serverJsPath]],
  ];

  for (const [label, command, args] of checks) {
    let resp;
    try {
      resp = await initializeCheck(label, command, args, installDir, childEnv);
    } catch (err) {
      fail(err instanceof Error ? err.message : String(err));
    }
    if (resp.error) {
      fail(`${label}: initialize devolvio error: ${JSON.stringify(resp.error)}`);
    }
    const serverInfo = resp.result?.serverInfo;
    if (serverInfo?.name !== 'mcp-reportia') {
      fail(`${label}: serverInfo.name inesperado: ${JSON.stringify(serverInfo)}`);
    }
    if (serverInfo?.version !== pkg.version) {
      fail(`${label}: serverInfo.version (${serverInfo?.version}) no coincide con package.json (${pkg.version})`);
    }
    process.stdout.write(`[bin-install-smoke] OK: ${label} respondio initialize (version ${serverInfo.version}).\n`);
  }

  process.stdout.write('\n[bin-install-smoke] OK: los tres caminos de arranque del paquete instalado responden.\n');
  process.exit(0);
}

main().catch((e) => {
  fail(e instanceof Error ? (e.stack ?? e.message) : String(e));
});

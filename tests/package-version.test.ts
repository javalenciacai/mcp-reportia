/**
 * `initialize` y el `User-Agent` por defecto deben anunciar la version real
 * del paquete (leida de `package.json`), no la `0.1.0` congelada del primer
 * release.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

import { PACKAGE_VERSION } from '../src/package-info.js';
import { loadConfig } from '../src/config.js';
import { createClient } from '../src/client.js';
import { createMcpServer } from '../src/server.js';

function readPackageJsonVersion(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const raw = readFileSync(path.join(here, '..', 'package.json'), 'utf8');
  return (JSON.parse(raw) as { version: string }).version;
}

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

describe('PACKAGE_VERSION', () => {
  it('coincide con la version declarada en package.json y no es la 0.1.0 congelada', () => {
    expect(PACKAGE_VERSION).toBe(readPackageJsonVersion());
    expect(PACKAGE_VERSION).not.toBe('0.1.0');
  });
});

describe('createMcpServer — initialize anuncia la version real', () => {
  it('serverInfo.version es PACKAGE_VERSION', async () => {
    const cfg = loadConfig(makeEnv());
    const server = createMcpServer(cfg, createClient(cfg));
    const client = new Client({ name: 'test-client', version: '0.0.1' });

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);

    try {
      expect(client.getServerVersion()).toEqual({ name: 'mcp-reportia', version: PACKAGE_VERSION });
    } finally {
      await client.close();
      await server.close();
    }
  });
});

describe('User-Agent por defecto', () => {
  it('loadConfig() usa mcp-reportia/<PACKAGE_VERSION> cuando REPORTIA_USER_AGENT no esta definida', () => {
    const cfg = loadConfig(makeEnv());
    expect(cfg.userAgent).toBe(`mcp-reportia/${PACKAGE_VERSION}`);
  });

  it('createClient(cfg).version expone PACKAGE_VERSION', () => {
    const cfg = loadConfig(makeEnv());
    const client = createClient(cfg);
    expect(client.version).toBe(PACKAGE_VERSION);
  });
});

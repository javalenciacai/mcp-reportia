#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadConfig } from './config.js';
import { createClient } from './client.js';
import { allTools } from './tools/index.js';

export function createMcpServer(cfg = loadConfig(), client = createClient(cfg)) {
  const server = new McpServer({ name: 'mcp-reportia', version: '0.1.0' });
  const ctx = { client, defaultCompanyId: cfg.companyId };
  for (const tool of allTools) {
    server.registerTool(
      tool.name,
      {
        description: tool.description,
        // SDK 1.30 accepts either a Zod schema instance or a raw shape
        // (a plain object whose values are Zod schemas). The previous code
        // passed a JSON-Schema-like object produced by `zodToInputShape`,
        // which the SDK now rejects with "inputSchema must be a Zod schema
        // or raw shape, received an unrecognized object".
        inputSchema: tool.inputSchema.shape,
      },
      (async (args: any) => {
        const parsed = tool.inputSchema.safeParse(args ?? {});
        if (!parsed.success) {
          return {
            isError: true,
            content: [{ type: 'text', text: JSON.stringify({ code: 'INVALID_INPUT', errors: parsed.error.issues }) }],
          };
        }
        const r = await tool.handler(parsed.data, ctx);
        return r.ok
          ? { content: [{ type: 'text', text: r.content }], ...(r.data && typeof r.data === 'object' ? { structuredContent: r.data } : {}) }
          : { isError: true, content: [{ type: 'text', text: JSON.stringify((r as any).error) }] };
      }) as any,
    );
  }
  return server;
}

async function main() {
  try {
    const s = createMcpServer();
    const client = createClient(loadConfig());

    // SIGINT/SIGTERM handler: cierra la sesion del backend Reportia antes
    // de salir, evitando sesiones colgadas (Juez B: B16).
    const shutdown = async (signal: string) => {
      process.stderr.write(`[mcp-reportia] recibido ${signal}, cerrando...\n`);
      try {
        await client.close();
      } catch (e) {
        process.stderr.write(
          `[mcp-reportia] error cerrando cliente: ${e instanceof Error ? e.message : String(e)}\n`,
        );
      }
      process.exit(0);
    };
    process.on('SIGINT', () => void shutdown('SIGINT'));
    process.on('SIGTERM', () => void shutdown('SIGTERM'));

    await s.connect(new StdioServerTransport());
  } catch (e) {
    // stdio transport owns stdout; keep all diagnostics on stderr only.
    process.stderr.write(`[mcp-reportia] ${e instanceof Error ? e.message : String(e)}\n`);
    process.exitCode = 1;
  }
}

/**
 * Robust entry detection across platforms.
 *
 * The naive `import.meta.url === file://${process.argv[1]}` comparison breaks
 * on Windows: `import.meta.url` yields `file:///C:/path/server.js` (note the
 * three slashes) while the comparison produced `file://C:/path/server.js`
 * (two slashes, no leading slash), so main() never ran and the server
 * exited immediately with code 0.
 *
 * A second pitfall under Git Bash on Windows: `process.argv[1]` may arrive
 * as a POSIX-style path such as `/c/james/mcp-reportia/dist/server.js`
 * while `fileURLToPath(import.meta.url)` yields the native form
 * `C:\james\mcp-reportia\dist\server.js`. Plain `path.resolve` on either
 * side keeps its input flavor, so the equality check fails and main() is
 * never invoked.
 *
 * To cover all known flavors, we accept the entry as long as BOTH sides
 * point to a file named `server.js` and either:
 *   (a) the resolved paths compare equal under `path.resolve`, OR
 *   (b) one side is a POSIX-style path (starts with `/` after a single
 *       optional drive letter) and the other is a Windows-style path, and
 *       their `path.basename` matches case-insensitively, OR
 *   (c) the normalized lower-cased, forward-slashed absolute paths match.
 *
 * Module imports (e.g. under vitest) leave `process.argv[1]` as the test
 * runner script, whose basename is NOT `server.js`, so main() is not
 * invoked and the exported `createMcpServer` stays usable.
 */
function normalizeForCompare(p: string): string {
  // Lowercase, forward-slash only, strip trailing slashes.
  return path.resolve(p).replace(/\\/g, '/').toLowerCase().replace(/\/+$/, '');
}

function isMainEntrypoint(): boolean {
  try {
    const argv1 = process.argv[1];
    if (!argv1) return false;
    const modulePath = fileURLToPath(import.meta.url);
    const argvPath = path.resolve(argv1);

    // (a) exact resolved match.
    if (argvPath === modulePath) return true;

    // (b) both must end in server.js (case-insensitive) — otherwise we are
    // being imported, not executed.
    const argvBase = path.basename(argvPath).toLowerCase();
    const moduleBase = path.basename(modulePath).toLowerCase();
    if (argvBase !== 'server.js' || moduleBase !== 'server.js') return false;

    // (c) tolerate Git Bash POSIX-style argv vs Windows-native module url
    // (or vice-versa) by comparing normalized, lower-cased, slash-only
    // absolute paths.
    return normalizeForCompare(argvPath) === normalizeForCompare(modulePath);
  } catch {
    return false;
  }
}

if (isMainEntrypoint()) {
  void main();
}

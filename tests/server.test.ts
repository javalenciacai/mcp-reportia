/**
 * Integration test for sdd/date-filter-v4-debug.
 *
 * The bug:
 *   - v0.3.4 wrapped `ListFiltersInput` with `.strict().superRefine()`,
 *     turning the schema into a `ZodEffects`.
 *   - `src/server.ts:25` was calling `tool.inputSchema.shape`, which
 *     returns `undefined` for `ZodEffects`.
 *   - The MCP SDK 1.30 silently substituted `properties: {}` when
 *     `inputSchema.shape === undefined`, dropping all LLM-supplied
 *     arguments at registration time.
 *
 * This test registers a tool with the SAME schema shape as
 * `reportia_movements_list` (a `ZodEffects` from `.strict().superRefine()`)
 * against a real `McpServer` from `@modelcontextprotocol/sdk`, drives the
 * in-memory JSON-RPC `tools/list` round-trip via `Client` +
 * `InMemoryTransport`, and asserts the SDK response carries the actual
 * tool fields (not `properties: {}`).
 *
 * Why in-memory instead of stdio spawn:
 *   - vitest runs with `pool: 'forks'`, so spawning stdio child processes
 *     from a forked worker is fragile (stdio buffering, newline framing,
 *     parent death semantics). `InMemoryTransport` exercises the SAME
 *     JSON-RPC wire protocol without those hazards.
 *   - The bug was SDK-facing: the SDK accepted `undefined` and substituted
 *     `properties: {}`. That's a server-side acceptance bug, not a
 *     transport bug — so testing against `InMemoryTransport` exercises the
 *     exact code path that produced the regression.
 */
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { extractRawShape } from '../src/tool-base.js';

describe('server registration — ZodEffects inputSchema reaches the SDK with full fields', () => {
  it('reports the tool fields in tools/list (not properties: {})', async () => {
    const server = new McpServer({ name: 'mcp-reportia-test', version: '0.3.6-test' });

    // Mirror the production schema shape: companyId + filter fields +
    // REQ-MCP-OUTPUT-05 transport metadata. Wrap with .strict().superRefine()
    // to reproduce the exact ZodEffects that triggered the regression.
    const inputSchema = z
      .object({
        companyId: z.number().int().positive(),
        dateFrom: z.string().optional(),
        dateTo: z.string().optional(),
        nit: z.string().optional(),
        numeroDocumento: z.string().optional(),
        tipoComprobante: z.enum(['factura', 'pago', 'recepcion']).optional(),
        emailStatus: z.enum(['all', 'paid', 'pending']).optional(),
        limit: z.number().int().min(1).max(1000).optional().default(100),
        offset: z.number().int().min(0).optional().default(0),
        confirmBroadQuery: z.boolean().optional().default(false),
        signal: z.unknown().optional(),
        sessionId: z.string().optional(),
        _meta: z.unknown().optional(),
      })
      .strict()
      .superRefine(() => {
        // no-op; the wrapping is the point of the test
      });

    server.registerTool(
      'reportia_movements_list',
      {
        description: 'List accounting movements (test stub).',
        // The fix under test: drill through ZodEffects instead of relying
        // on `.shape`, which is `undefined` for wrapped schemas.
        inputSchema: extractRawShape(inputSchema),
      },
      async () => ({
        content: [{ type: 'text', text: 'ok' }],
      }),
    );

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 'test-client', version: '0.0.1' });

    await server.connect(serverTransport);
    await client.connect(clientTransport);

    try {
      const result = await client.listTools();

      const tool = result.tools.find((t) => t.name === 'reportia_movements_list');
      expect(tool, 'tool registered under reportia_movements_list').toBeDefined();

      // The regression's smoking gun: inputSchema.properties was {}.
      // After the fix, properties must include every declared field.
      const properties = tool?.inputSchema.properties ?? {};
      const propKeys = Object.keys(properties).sort();

      expect(propKeys).toEqual(
        [
          '_meta',
          'companyId',
          'confirmBroadQuery',
          'dateFrom',
          'dateTo',
          'emailStatus',
          'limit',
          'nit',
          'numeroDocumento',
          'offset',
          'sessionId',
          'signal',
          'tipoComprobante',
        ].sort(),
      );

      // Defensive: the shape must NOT be the empty `{}` that the SDK
      // silently substitutes when inputSchema.shape is undefined.
      expect(propKeys).not.toEqual([]);
    } finally {
      await client.close();
      await server.close();
    }
  });

  it('preserves the plain-ZodObject path (backward compat with non-wrapped tools)', async () => {
    // The helper must be a no-op for plain ZodObjects so the fix doesn't
    // accidentally break tools that never adopted .strict().superRefine().
    const server = new McpServer({ name: 'mcp-reportia-test', version: '0.3.6-test' });

    const inputSchema = z.object({
      id: z.number().int().positive(),
      name: z.string(),
    });

    server.registerTool(
      'plain_tool',
      {
        description: 'Tool without wrapped schema.',
        inputSchema: extractRawShape(inputSchema),
      },
      async () => ({
        content: [{ type: 'text', text: 'ok' }],
      }),
    );

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 'test-client', version: '0.0.1' });

    await server.connect(serverTransport);
    await client.connect(clientTransport);

    try {
      const result = await client.listTools();
      const tool = result.tools.find((t) => t.name === 'plain_tool');
      expect(tool).toBeDefined();

      const propKeys = Object.keys(tool?.inputSchema.properties ?? {}).sort();
      expect(propKeys).toEqual(['id', 'name'].sort());
    } finally {
      await client.close();
      await server.close();
    }
  });
});

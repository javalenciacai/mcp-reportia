/**
 * Tools de salud, autenticación y diagnóstico.
 */
import { z } from 'zod';
import { type ToolDefinition, ok, fail } from '../tool-base.js';

const DiagnosticsInput = z.object({
  includeSession: z.boolean().optional().default(false).describe('Incluye info de sesión si true (default false).'),
});

const healthTool: ToolDefinition<typeof DiagnosticsInput> = {
  name: 'reportia_health',
  description:
    'Devuelve el estado de salud de la API de Reportia y un diagnóstico del cliente MCP (modo auth, base URL, descarga dir). Útil como primera llamada para validar conectividad.',
  inputSchema: DiagnosticsInput,
  handler: async (input, ctx) => {
    try {
      const diag = ctx.client.diagnostics();
      let apiHealth: unknown = null;
      let apiErr: string | null = null;
      try {
        // /api/health es publico en Reportia: skipSession evita un login
        // innecesario en cada health-check (Juez B: B23).
        apiHealth = await ctx.client.call<unknown>('/api/health', { headers: { 'X-Skip-Session': '1' } });
      } catch (e) {
        apiErr = e instanceof Error ? e.message : String(e);
      }
      const payload = {
        client: {
          version: ctx.client.version,
          authMode: diag.authMode,
          baseUrl: diag.baseUrl,
          downloadDir: diag.downloadDir,
          ...(input.includeSession ? { hasSession: diag.hasSession, userId: diag.userId } : {}),
        },
        api: apiHealth ?? { error: apiErr },
      };
      return ok(payload);
    } catch (err) {
      return fail(err);
    }
  },
};

const WhoAmIInput = z.object({});

const whoamiTool: ToolDefinition<typeof WhoAmIInput> = {
  name: 'reportia_whoami',
  description:
    'Devuelve el perfil del usuario autenticado en Reportia (GET /api/auth/me). Útil para confirmar que la sesión está activa.',
  inputSchema: WhoAmIInput,
  handler: async (_input, ctx) => {
    try {
      const me = await ctx.client.call<unknown>('/api/auth/me');
      return ok(me);
    } catch (err) {
      return fail(err);
    }
  },
};

const LogoutInput = z.object({});
const logoutTool: ToolDefinition<typeof LogoutInput> = {
  name: 'reportia_logout',
  description: 'Cierra la sesión actual contra Reportia (POST /api/auth/logout). Invalida la sesión local del cliente MCP tras el logout.',
  inputSchema: LogoutInput,
  handler: async (_input, ctx) => {
    try {
      await ctx.client.call<unknown>('/api/auth/logout', { method: 'POST' });
      ctx.client.invalidateSession();
      return ok({ loggedOut: true });
    } catch (err) {
      return fail(err);
    }
  },
};

export const authHealthTools: ToolDefinition<any>[] = [
  healthTool,
  whoamiTool,
  logoutTool,
];
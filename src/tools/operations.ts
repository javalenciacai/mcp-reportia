/**
 * Herramientas read-only de operacion:
 *  - Historial y estado de cargas (uploads)
 *  - Salud de colas y workers
 *  - SIIGO: settings, clients, sync runs, run trace, schedules, history
 *
 * Todas estas tools exponen unicamente GETs verificados en
 *   C:\james\Reportia\server\routes.ts
 *   C:\james\Reportia\server\auth-middleware.ts
 * y delegan en `resolveCompanyId` / `ok` / `fail` de tool-base.
 */
import { z } from 'zod';
import type { ToolDefinition } from '../tool-base.js';
import { ok, fail, resolveCompanyId, assertConfirmed } from '../tool-base.js';

// =========================================================================
// Uploads: historial y estado
// =========================================================================

const CompanyIdInput = z.object({
  companyId: z.number().int().positive().optional(),
});

const UploadHistoryInput = CompanyIdInput;

const uploadHistoryTool: ToolDefinition<typeof UploadHistoryInput> = {
  name: 'reportia_uploads_history_list',
  description:
    'Lista el historial de cargas (uploads) de una empresa, filtrado por el usuario autenticado y limitado a 20 entradas visibles (GET /api/companies/:companyId/upload-history).',
  inputSchema: UploadHistoryInput,
  handler: async (input, ctx) => {
    try {
      const companyId = resolveCompanyId(input, ctx);
      const data = await ctx.client.call<unknown>(
        `/api/companies/${companyId}/upload-history`,
      );
      return ok(data);
    } catch (err) {
      return fail(err);
    }
  },
};

const UploadStatusInput = z.object({
  uploadId: z.number().int().positive(),
});

const uploadStatusTool: ToolDefinition<typeof UploadStatusInput> = {
  name: 'reportia_upload_status_get',
  description:
    'Obtiene el estado actual de un upload especifico, incluyendo progreso visible y diagnostico de su job en cola (GET /api/upload/:uploadId/status).',
  inputSchema: UploadStatusInput,
  handler: async (input, ctx) => {
    try {
      const data = await ctx.client.call<unknown>(
        `/api/upload/${input.uploadId}/status`,
      );
      return ok(data);
    } catch (err) {
      return fail(err);
    }
  },
};

// =========================================================================
// Colas: salud del sistema y de los workers
// =========================================================================

const QueueSystemHealthInput = z.object({});

const queueSystemHealthTool: ToolDefinition<typeof QueueSystemHealthInput> = {
  name: 'reportia_health_queue_system',
  description:
    'Verifica la salud del sistema de colas (queue system health check, sin autenticacion de empresa). Util para diagnostico de BullMQ / Redis (GET /api/health/queue-system).',
  inputSchema: QueueSystemHealthInput,
  handler: async (_input, ctx) => {
    try {
      // Endpoint publico: skipSession para evitar latencia y 401 espurios.
      const data = await ctx.client.call<unknown>('/api/health/queue-system', { headers: { 'X-Skip-Session': '1' } });
      return ok(data);
    } catch (err) {
      return fail(err);
    }
  },
};

const WorkersHealthInput = z.object({});

const workersHealthTool: ToolDefinition<typeof WorkersHealthInput> = {
  name: 'reportia_health_workers',
  description:
    'Devuelve la salud de los workers de la cola y el lag actual, con un flag `isStuck` y timestamp de la verificacion (GET /api/queue/workers/health).',
  inputSchema: WorkersHealthInput,
  handler: async (_input, ctx) => {
    try {
      // Endpoint publico: skipSession.
      const data = await ctx.client.call<unknown>('/api/queue/workers/health', { headers: { 'X-Skip-Session': '1' } });
      return ok(data);
    } catch (err) {
      return fail(err);
    }
  },
};

// =========================================================================
// SIIGO: settings, clients, sync runs, schedules, history (todas GET)
// =========================================================================

const SiigoSettingsInput = CompanyIdInput;

const siigoSettingsTool: ToolDefinition<typeof SiigoSettingsInput> = {
  name: 'reportia_siigo_settings_get',
  description:
    'Obtiene la configuracion SIIGO Pyme de una empresa (GET /api/companies/:companyId/siigo-settings).',
  inputSchema: SiigoSettingsInput,
  handler: async (input, ctx) => {
    try {
      const companyId = resolveCompanyId(input, ctx);
      const data = await ctx.client.call<unknown>(
        `/api/companies/${companyId}/siigo-settings`,
      );
      return ok(data);
    } catch (err) {
      return fail(err);
    }
  },
};

const SiigoClientsInput = CompanyIdInput;

const siigoClientsTool: ToolDefinition<typeof SiigoClientsInput> = {
  name: 'reportia_siigo_clients_list',
  description:
    'Lista los clientes remotos disponibles en SIIGO para una empresa (proxy contra el servicio SIIGO; requiere token externo vigente) (GET /api/companies/:companyId/siigo/clients).',
  inputSchema: SiigoClientsInput,
  handler: async (input, ctx) => {
    try {
      const companyId = resolveCompanyId(input, ctx);
      const data = await ctx.client.call<unknown>(
        `/api/companies/${companyId}/siigo/clients`,
      );
      return ok(data);
    } catch (err) {
      return fail(err);
    }
  },
};

const SiigoSyncRunsInput = CompanyIdInput.extend({
  /** Numero maximo de corridas a devolver (el servidor capa a 200, por defecto 50). */
  limit: z.number().int().positive().max(200).optional(),
});

const siigoSyncRunsTool: ToolDefinition<typeof SiigoSyncRunsInput> = {
  name: 'reportia_siigo_sync_runs_list',
  description:
    'Lista las corridas de sincronizacion SIIGO de una empresa (GET /api/companies/:companyId/siigo/sync/runs). Parametro opcional `limit` (1-200, por defecto 50).',
  inputSchema: SiigoSyncRunsInput,
  handler: async (input, ctx) => {
    try {
      const companyId = resolveCompanyId(input, ctx);
      const data = await ctx.client.call<unknown>(
        `/api/companies/${companyId}/siigo/sync/runs`,
        {
          method: 'GET',
          query: { limit: input.limit },
        },
      );
      return ok(data);
    } catch (err) {
      return fail(err);
    }
  },
};

const SiigoRunTraceInput = CompanyIdInput.extend({
  runId: z.number().int().positive(),
});

const siigoRunTraceTool: ToolDefinition<typeof SiigoRunTraceInput> = {
  name: 'reportia_siigo_run_trace_get',
  description:
    'Obtiene la trazabilidad completa (trace) de una corrida de sincronizacion SIIGO especifica (GET /api/companies/:companyId/siigo/sync/runs/:runId/trace).',
  inputSchema: SiigoRunTraceInput,
  handler: async (input, ctx) => {
    try {
      const companyId = resolveCompanyId(input, ctx);
      const data = await ctx.client.call<unknown>(
        `/api/companies/${companyId}/siigo/sync/runs/${input.runId}/trace`,
      );
      return ok(data);
    } catch (err) {
      return fail(err);
    }
  },
};

const SiigoSchedulesInput = CompanyIdInput;

const siigoSchedulesTool: ToolDefinition<typeof SiigoSchedulesInput> = {
  name: 'reportia_siigo_schedules_list',
  description:
    'Lista las programaciones (schedules) de sincronizacion SIIGO configuradas para una empresa (GET /api/companies/:companyId/siigo/schedules).',
  inputSchema: SiigoSchedulesInput,
  handler: async (input, ctx) => {
    try {
      const companyId = resolveCompanyId(input, ctx);
      const data = await ctx.client.call<unknown>(
        `/api/companies/${companyId}/siigo/schedules`,
      );
      return ok(data);
    } catch (err) {
      return fail(err);
    }
  },
};

const SiigoHistoryInput = CompanyIdInput;

const SiigoHistoryInputWithConfirm = z.object({
  companyId: z.number().int().positive().optional(),
  confirm: z.boolean().optional(),
});

const siigoHistoryTool: ToolDefinition<typeof SiigoHistoryInputWithConfirm> = {
  name: 'reportia_siigo_history_get',
  description:
    'Obtiene el historial de comandos SIIGO de una empresa. ⚠️ ATENCION: si el servidor detecta comandos activos, dispara una sincronizacion on-demand antes de devolver el resultado. DESTRUCTIVA: requiere { confirm: true } para evitar sincronizaciones accidentales.',
  inputSchema: SiigoHistoryInputWithConfirm,
  destructive: true,
  handler: async (input, ctx) => {
    try {
      assertConfirmed(input, 'reportia_siigo_history_get');
      const companyId = resolveCompanyId(input, ctx);
      const data = await ctx.client.call<unknown>(
        `/api/companies/${companyId}/siigo/history`,
      );
      return ok(data);
    } catch (err) {
      return fail(err);
    }
  },
};

// =========================================================================
// Registro
// =========================================================================

export const operationsTools: ToolDefinition<any>[] = [
  uploadHistoryTool,
  uploadStatusTool,
  queueSystemHealthTool,
  workersHealthTool,
  siigoSettingsTool,
  siigoClientsTool,
  siigoSyncRunsTool,
  siigoRunTraceTool,
  siigoSchedulesTool,
  siigoHistoryTool,
];
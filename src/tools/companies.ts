/**
 * Tools relacionadas con empresas (companies) y su configuracion.
 */
import { z } from 'zod';
import type { ToolDefinition } from '../tool-base.js';
import { ok, fail, resolveCompanyId, assertConfirmed } from '../tool-base.js';

const ListInput = z.object({});

const listCompaniesTool: ToolDefinition<typeof ListInput> = {
  name: 'reportia_companies_list',
  description: 'Lista las empresas accesibles para el usuario autenticado (GET /api/companies).',
  inputSchema: ListInput,
  handler: async (_input, ctx) => {
    try {
      const data = await ctx.client.call<unknown>('/api/companies');
      return ok(data);
    } catch (err) {
      return fail(err);
    }
  },
};

const GetInput = z.object({
  companyId: z.number().int().positive().optional(),
});

const getCompanyTool: ToolDefinition<typeof GetInput> = {
  name: 'reportia_company_get',
  description: 'Obtiene el detalle de una empresa (GET /api/companies/:id).',
  inputSchema: GetInput,
  handler: async (input, ctx) => {
    try {
      const id = resolveCompanyId(input, ctx);
      const data = await ctx.client.call<unknown>(`/api/companies/${id}`);
      return ok(data);
    } catch (err) {
      return fail(err);
    }
  },
};

const GetSettingsInput = z.object({
  companyId: z.number().int().positive().optional(),
});

const getSettingsTool: ToolDefinition<typeof GetSettingsInput> = {
  name: 'reportia_company_settings_get',
  description: 'Obtiene la configuracion de una empresa (GET /api/companies/:id/settings).',
  inputSchema: GetSettingsInput,
  handler: async (input, ctx) => {
    try {
      const id = resolveCompanyId(input, ctx);
      const data = await ctx.client.call<unknown>(`/api/companies/${id}/settings`);
      return ok(data);
    } catch (err) {
      return fail(err);
    }
  },
};

const PatchSettingsInput = z.object({
  companyId: z.number().int().positive().optional(),
  settings: z.record(z.unknown()).describe('Objeto CompanySettings parcial con los campos a actualizar.'),
  confirm: z.boolean().optional(),
});

const patchSettingsTool: ToolDefinition<typeof PatchSettingsInput> = {
  name: 'reportia_company_settings_update',
  description:
    'Actualiza parcialmente la configuración de una empresa (PATCH /api/companies/:id/settings). DESTRUCTIVA: requiere { confirm: true }.',
  inputSchema: PatchSettingsInput,
  destructive: true,
  handler: async (input, ctx) => {
    try {
      const id = resolveCompanyId(input, ctx);
      assertConfirmed(input, 'reportia_company_settings_update');
      const data = await ctx.client.call<unknown>(`/api/companies/${id}/settings`, {
        method: 'PATCH',
        body: input.settings,
      });
      return ok(data);
    } catch (err) {
      return fail(err);
    }
  },
};

const ActivateInput = z.object({
  companyId: z.number().int().positive().optional(),
  confirm: z.boolean().optional(),
});

const activateTool: ToolDefinition<typeof ActivateInput> = {
  name: 'reportia_company_activate',
  description:
    'Activa una empresa (POST /api/companies/:id/activate). Requiere confirm=true.',
  inputSchema: ActivateInput,
  destructive: true,
  handler: async (input, ctx) => {
    try {
      const id = resolveCompanyId(input, ctx);
      assertConfirmed(input, 'reportia_company_activate');
      const data = await ctx.client.call<unknown>(`/api/companies/${id}/activate`, {
        method: 'POST',
      });
      return ok(data);
    } catch (err) {
      return fail(err);
    }
  },
};

export const companyTools: ToolDefinition<any>[] = [
  listCompaniesTool,
  getCompanyTool,
  getSettingsTool,
  patchSettingsTool,
  activateTool,
];
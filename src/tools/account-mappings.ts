/**
 * Herramientas para gestión de mapeo de cuentas contables.
 *
 * Incluye operaciones para listar, crear, actualizar y eliminar mapeos de cuentas,
 * así como búsqueda de códigos de cuenta.
 */
import { z } from 'zod';
import type { ToolDefinition } from '../tool-base.js';
import { ok, fail, resolveCompanyId, assertConfirmed } from '../tool-base.js';

const CompanyIdInput = z.object({
  companyId: z.number().int().positive().optional(),
});

// List account mappings
const ListAccountMappingsInput = CompanyIdInput.extend({
  limit: z.number().int().min(1).max(1000).optional().default(100),
});

// Create account mapping
const CreateAccountMappingInput = CompanyIdInput.extend({
  accountCode: z.string().min(1).max(20),
  category: z.string().min(1).max(50),
  description: z.string().min(5).max(200).optional(),
});

// Update account mapping
const UpdateAccountMappingInput = CompanyIdInput.extend({
  mappingId: z.number().int().positive(),
  accountCode: z.string().min(1).max(20),
  category: z.string().min(1).max(50),
  description: z.string().min(5).max(200).optional(),
});

// Delete account mapping
const DeleteAccountMappingInput = CompanyIdInput.extend({
  mappingId: z.number().int().positive(),
  confirm: z.boolean().optional(),
});

// Search account codes by prefix
const SearchAccountCodesInput = CompanyIdInput.extend({
  prefix: z.string().min(1).max(20),
  limit: z.number().int().min(1).max(1000).optional().default(50),
});

// Tools
const ListAccountMappingsTool: ToolDefinition<typeof ListAccountMappingsInput> = {
  name: 'reportia_account_mappings_list',
  description: 'Lista los mapeos de cuentas contables para una empresa.',
  inputSchema: ListAccountMappingsInput,
  handler: async (input, ctx) => {
    try {
      const companyId = resolveCompanyId(input, ctx);
      const data = await ctx.client.call(`/api/companies/${companyId}/account-mappings`, {
        method: 'GET',
        query: {
          limit: input.limit,
        },
      });
      return ok(data);
    } catch (err) {
      return fail(err);
    }
  },
};

const CreateAccountMappingTool: ToolDefinition<typeof CreateAccountMappingInput> = {
  name: 'reportia_account_mapping_create',
  description: 'Crea un nuevo mapeo de cuenta contable para una empresa.',
  inputSchema: CreateAccountMappingInput,
  handler: async (input, ctx) => {
    try {
      const companyId = resolveCompanyId(input, ctx);
      const data = await ctx.client.call('/api/account-mappings', {
        method: 'POST',
        body: {
          companyId,
          accountCode: input.accountCode,
          category: input.category,
          description: input.description,
        },
      });
      return ok(data);
    } catch (err) {
      return fail(err);
    }
  },
};

const UpdateAccountMappingTool: ToolDefinition<typeof UpdateAccountMappingInput> = {
  name: 'reportia_account_mapping_update',
  description: 'Actualiza un mapeo de cuenta contable existente.',
  inputSchema: UpdateAccountMappingInput,
  handler: async (input, ctx) => {
    try {
      resolveCompanyId(input, ctx);
      const data = await ctx.client.call(`/api/account-mappings/${input.mappingId}`, {
        method: 'PATCH',
        body: {
          accountCode: input.accountCode,
          category: input.category,
          description: input.description,
        },
      });
      return ok(data);
    } catch (err) {
      return fail(err);
    }
  },
};

const DeleteAccountMappingTool: ToolDefinition<typeof DeleteAccountMappingInput> = {
  name: 'reportia_account_mapping_delete',
  description: 'Elimina un mapeo de cuenta contable.',
  inputSchema: DeleteAccountMappingInput,
  destructive: true,
  handler: async (input, ctx) => {
    try {
      assertConfirmed(input, 'reportia_account_mapping_delete');
      resolveCompanyId(input, ctx);
      const data = await ctx.client.call(`/api/account-mappings/${input.mappingId}`, {
        method: 'DELETE',
      });
      return ok(data);
    } catch (err) {
      return fail(err);
    }
  },
};

const SearchAccountCodesTool: ToolDefinition<typeof SearchAccountCodesInput> = {
  name: 'reportia_account_codes_search',
  description: 'Busca códigos de cuenta únicos por prefijo dentro de los movimientos contables de una empresa.',
  inputSchema: SearchAccountCodesInput,
  handler: async (input, ctx) => {
    try {
      const companyId = resolveCompanyId(input, ctx);
      const data = await ctx.client.call(`/api/companies/${companyId}/account-codes/search`, {
        method: 'GET',
        query: {
          prefix: input.prefix,
          limit: input.limit,
        },
      });
      return ok(data);
    } catch (err) {
      return fail(err);
    }
  },
};

export const accountMappingTools: ToolDefinition<any>[] = [
  ListAccountMappingsTool,
  CreateAccountMappingTool,
  UpdateAccountMappingTool,
  DeleteAccountMappingTool,
  SearchAccountCodesTool,
];

/**
 * Herramientas para gestión de terceros (clientes/proveedores).
 *
 * Incluye operaciones para listar, buscar por NIT, obtener balance de cartera,
 * y búsqueda avanzada.
 */
import { z } from 'zod';
import type { ToolDefinition } from '../tool-base.js';
import { ok, fail, resolveCompanyId } from '../tool-base.js';

const CompanyIdInput = z.object({
  companyId: z.number().int().positive().optional(),
});

// Third party listing
const ListThirdPartiesInput = CompanyIdInput.extend({
  limit: z.number().int().min(1).max(1000).optional().default(100),
});

// Search by NIT or name
const SearchThirdPartiesInput = CompanyIdInput.extend({
  q: z.string().min(2),
  limit: z.number().int().min(1).max(1000).optional().default(50),
});

// NITs en Colombia admiten puntos como separadores de miles y guion
// antes del digito de verificacion (e.g. "900.123.456-7"). Restringimos
// el alfabeto a un set seguro para evitar inyeccion en la URL del path.
const GetThirdPartyByNitInput = CompanyIdInput.extend({
  nit: z
    .string()
    .min(5)
    .max(20)
    .regex(/^[A-Za-z0-9.-]+$/, { message: 'NIT solo permite letras, digitos, punto y guion.' }),
});

// Portfolio balance (POST /third-parties/portfolio-balance con nits[] y cutoffDate)
const PortfolioBalanceInput = CompanyIdInput.extend({
  // Cap en 500 NITs para prevenir DoS por listas enormes.
  nits: z.array(z.string().min(1).max(20)).min(1).max(500),
  cutoffDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { message: 'Formato de fecha inválido (YYYY-MM-DD)' }),
});

export const thirdPartyTools: ToolDefinition<any>[] = [
  {
    name: 'reportia_third_parties_list',
    description: 'Lista todos los terceros de una empresa.',
    inputSchema: ListThirdPartiesInput,
    handler: async (input, ctx) => {
      try {
        const companyId = resolveCompanyId(input, ctx);
        const data = await ctx.client.call(`/api/companies/${companyId}/third-parties`, {
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
  },
  {
    name: 'reportia_third_parties_search',
    description: 'Busca terceros por NIT o nombre.',
    inputSchema: SearchThirdPartiesInput,
    handler: async (input, ctx) => {
      try {
        const companyId = resolveCompanyId(input, ctx);
        const data = await ctx.client.call(`/api/companies/${companyId}/third-parties/search`, {
          method: 'GET',
          query: {
            q: input.q,
            limit: input.limit,
          },
        });
        return ok(data);
      } catch (err) {
        return fail(err);
      }
    },
  },
  {
    name: 'reportia_third_parties_get_by_nit',
    description: 'Obtiene un tercero por su NIT.',
    inputSchema: GetThirdPartyByNitInput,
    handler: async (input, ctx) => {
      try {
        const companyId = resolveCompanyId(input, ctx);
        const data = await ctx.client.call(
          `/api/companies/${companyId}/third-parties/nit/${encodeURIComponent(input.nit)}`,
          { method: 'GET' },
        );
        return ok(data);
      } catch (err) {
        return fail(err);
      }
    },
  },
  {
    name: 'reportia_third_parties_portfolio_balance',
    description: 'Obtiene el balance de cartera de una empresa para los NITs dados.',
    inputSchema: PortfolioBalanceInput,
    handler: async (input, ctx) => {
      try {
        const companyId = resolveCompanyId(input, ctx);
        const data = await ctx.client.call(
          `/api/companies/${companyId}/third-parties/portfolio-balance`,
          {
            method: 'POST',
            body: {
              nits: input.nits,
              cutoffDate: input.cutoffDate,
            },
          },
        );
        return ok(data);
      } catch (err) {
        return fail(err);
      }
    },
  },
];

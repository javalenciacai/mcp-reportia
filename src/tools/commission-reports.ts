/**
 * Herramientas para reportes de comisiones.
 *
 * Incluye generación de reportes de comisiones, exportación a Excel
 * con jerarquía de 3 niveles (Plan 37).
 *
 * Endpoints Reportia:
 *   GET /api/companies/:companyId/commission-report            (JSON, lista)
 *   GET /api/companies/:companyId/commission-report/export     (XLSX, download)
 *
 * Filtros aceptados por la API: startDate, endDate, thirdPartyFilter,
 * salespersonFilter, paymentStatus.
 */
import { z } from 'zod';
import type { ToolDefinition } from '../tool-base.js';
import { ok, fail, resolveCompanyId, IsoDateString } from '../tool-base.js';

// Input schemas

/** Schema común para filtros de comisión que aceptan la API. */
const CommissionFiltersInput = z.object({
  companyId: z.number().int().positive().optional(),
  startDate: IsoDateString.optional(),
  endDate: IsoDateString.optional(),
  thirdPartyFilter: z.string().optional(),
  salespersonFilter: z.string().optional(),
  paymentStatus: z.enum(['all', 'paid', 'pending']).optional(),
});

// Tools

const ListCommissionTool: ToolDefinition<typeof CommissionFiltersInput> = {
  name: 'reportia_commission_list',
  description:
    'Lista el reporte de comisiones de una empresa con filtros opcionales (fecha, terceros, vendedores, estado de pago).',
  inputSchema: CommissionFiltersInput,
  handler: async (input, ctx) => {
    try {
      const companyId = resolveCompanyId(input, ctx);
      const data = await ctx.client.call(`/api/companies/${companyId}/commission-report`, {
        method: 'GET',
        query: {
          startDate: input.startDate,
          endDate: input.endDate,
          thirdPartyFilter: input.thirdPartyFilter,
          salespersonFilter: input.salespersonFilter,
          paymentStatus: input.paymentStatus,
        },
      });
      return ok(data);
    } catch (err) {
      return fail(err);
    }
  },
};

const ExportCommissionExcelTool: ToolDefinition<typeof CommissionFiltersInput> = {
  name: 'reportia_commission_export_excel',
  description:
    'Exporta el reporte completo de comisiones a Excel con jerarquía de 3 niveles (Plan 37). Recibe los mismos filtros que la herramienta de listado.',
  inputSchema: CommissionFiltersInput,
  handler: async (input, ctx) => {
    try {
      const companyId = resolveCompanyId(input, ctx);
      const download = await ctx.client.download(
        `/api/companies/${companyId}/commission-report/export`,
        {
          method: 'GET',
          query: {
            startDate: input.startDate,
            endDate: input.endDate,
            thirdPartyFilter: input.thirdPartyFilter,
            salespersonFilter: input.salespersonFilter,
            paymentStatus: input.paymentStatus,
          },
          suggestedFileName: 'reporte-comisiones.xlsx',
        },
      );
      return ok(download);
    } catch (err) {
      return fail(err);
    }
  },
};

export const commissionReportTools: ToolDefinition<any>[] = [
  ListCommissionTool,
  ExportCommissionExcelTool,
];
/**
 * Herramientas para movimientos contables.
 *
 * Incluye operaciones para listar movimientos, exportar a Excel/PDF,
 * eliminar movimientos, y eliminar todos los movimientos de una empresa.
 */
import { z } from 'zod';
import type { ToolDefinition } from '../tool-base.js';
import { ok, fail, resolveCompanyId, assertConfirmed, isValidIsoDate } from '../tool-base.js';

// Schemas

/** Normaliza fechas string|Date a string YYYY-MM-DD para query params.
 *  NOTA: la rama z.date() es inerte porque JSON.stringify de un Date
 *  produce ISO 8601 con T que NO matchea el regex. La conservamos
 *  defensivamente pero la fuente real siempre es string.
 *  Ademas validamos que la fecha sea real (no 2025-02-30). */
const DateString = z
  .union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { message: 'Formato de fecha inválido (YYYY-MM-DD)' }), z.date()])
  .optional()
  .transform((v) => {
    if (v === undefined) return undefined;
    if (v instanceof Date) {
      const yyyy = v.getUTCFullYear();
      const mm = String(v.getUTCMonth() + 1).padStart(2, '0');
      const dd = String(v.getUTCDate()).padStart(2, '0');
      return `${yyyy}-${mm}-${dd}`;
    }
    return v;
  })
  .refine((v) => v === undefined || isValidIsoDate(v), {
    message: 'Fecha invalida (ej: 2025-02-30, 2025-13-01)',
  });

const CompanyIdInput = z.object({
  companyId: z.number().int().positive().optional(),
});

const ListFiltersInput = CompanyIdInput.extend({
  startDate: DateString,
  endDate: DateString,
  nit: z.string().optional(),
  numeroDocumento: z.string().optional(),
  tipoComprobante: z.enum(['factura', 'pago', 'recepcion']).optional(),
  emailStatus: z.enum(['all', 'paid', 'pending']).optional(),
});

/** Esquema común para exportación: mismas claves que el listado + format + includePreviousBalance. */
const ExportInput = ListFiltersInput.extend({
  format: z.enum(['excel', 'pdf']),
  includePreviousBalance: z.boolean().optional(),
});

const DeleteAllInput = CompanyIdInput.extend({
  // Texto de confirmacion explicito: el ID al final del texto debe
  // coincidir con el companyId que se va a eliminar. Esto cierra el
  // bypass semantico donde el LLM podia escribir "ELIMINAR
  // MOVIMIENTOS EMPRESA 999" para una empresa con id=1. La validacion
  // exacta la hace el handler comparando el ID extraido contra
  // resolveCompanyId().
  confirmationText: z.string().regex(/^ELIMINAR MOVIMIENTOS EMPRESA \d+$/),
  reason: z.string().min(5).max(500),
  acknowledgeRisk: z.literal(true),
  confirm: z.boolean().optional(),
});

// Tools
const ListTool: ToolDefinition<typeof ListFiltersInput> = {
  name: 'reportia_movements_list',
  description: 'Lista movimientos contables con filtros opcionales para una empresa específica.',
  inputSchema: ListFiltersInput,
  handler: async (input, ctx) => {
    try {
      const companyId = resolveCompanyId(input, ctx);

      const data = await ctx.client.call(`/api/companies/${companyId}/accounting-movements`, {
        method: 'GET',
        query: {
          startDate: input.startDate,
          endDate: input.endDate,
          nit: input.nit,
          numeroDocumento: input.numeroDocumento,
          tipoComprobante: input.tipoComprobante,
          emailStatus: input.emailStatus,
        },
      });
      return ok(data);
    } catch (err) {
      return fail(err);
    }
  },
};

const ExportExcelTool: ToolDefinition<typeof ExportInput> = {
  name: 'reportia_movements_export_excel',
  description: 'Exporta movimientos contables a un archivo Excel.',
  inputSchema: ExportInput,
  handler: async (input, ctx) => {
    try {
      const companyId = resolveCompanyId(input, ctx);

      const download = await ctx.client.download(
        `/api/companies/${companyId}/accounting-movements/export/excel`,
        {
          method: 'GET',
          query: {
            startDate: input.startDate,
            endDate: input.endDate,
            nit: input.nit,
            numeroDocumento: input.numeroDocumento,
            includePreviousBalance: input.includePreviousBalance,
          },
          suggestedFileName: 'movimientos.xlsx',
        },
      );
      return ok(download);
    } catch (err) {
      return fail(err);
    }
  },
};

const ExportPdfTool: ToolDefinition<typeof ExportInput> = {
  name: 'reportia_movements_export_pdf',
  description: 'Exporta movimientos contables a un archivo PDF.',
  inputSchema: ExportInput,
  handler: async (input, ctx) => {
    try {
      const companyId = resolveCompanyId(input, ctx);

      const download = await ctx.client.download(
        `/api/companies/${companyId}/accounting-movements/export/pdf`,
        {
          method: 'GET',
          query: {
            startDate: input.startDate,
            endDate: input.endDate,
            nit: input.nit,
            numeroDocumento: input.numeroDocumento,
            includePreviousBalance: input.includePreviousBalance,
          },
          suggestedFileName: 'movimientos.pdf',
        },
      );
      return ok(download);
    } catch (err) {
      return fail(err);
    }
  },
};

const DeleteAllTool: ToolDefinition<typeof DeleteAllInput> = {
  name: 'reportia_movements_delete_all',
  description: 'Elimina todos los movimientos contables de una empresa después de confirmar explícitamente.',
  inputSchema: DeleteAllInput,
  destructive: true,
  handler: async (input, ctx) => {
    try {
      const companyId = resolveCompanyId(input, ctx);

      // Validacion de seguridad: el ID del confirmationText debe
      // coincidir con el companyId que se va a eliminar.
      const m = input.confirmationText.match(/\d+$/);
      const textId = m ? Number(m[0]) : NaN;
      if (!Number.isInteger(textId) || textId !== companyId) {
        return fail({
          code: 'CONFIRMATION_MISMATCH',
          message:
            `confirmationText (id=${textId}) no coincide con el companyId resuelto (id=${companyId}). ` +
            `Reescribe "ELIMINAR MOVIMIENTOS EMPRESA ${companyId}" para confirmar.`,
        });
      }

      assertConfirmed(input, 'reportia_movements_delete_all');

      const response = await ctx.client.call(
        `/api/companies/${companyId}/accounting-movements/delete-all`,
        {
          method: 'POST',
          body: {
            confirmationText: input.confirmationText,
            reason: input.reason,
            acknowledgeRisk: input.acknowledgeRisk,
          },
        },
      );
      return ok(response);
    } catch (err) {
      return fail(err);
    }
  },
};

export const accountingMovementTools: ToolDefinition<any>[] = [
  ListTool,
  ExportExcelTool,
  ExportPdfTool,
  DeleteAllTool,
];
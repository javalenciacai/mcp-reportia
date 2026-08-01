/**
 * Herramientas MCP para vendedores (salesperson mappings / options),
 * configuraciones de factura (invoice-settings) y envio de facturas
 * por correo electronico.
 *
 * Las herramientas destructivas (DELETE, POST /email, POST /send-multiple)
 * exigen `{ confirm: true }` en el payload. El servidor no loggea
 * el contenido de los payloads para evitar exponer secretos como
 * tokens SMTP, passwords de correo o cuerpos de mensaje.
 *
 * Endpoints Reportia cubiertos (verificados contra
 * C:\james\Reportia\server\routes.ts y routes/invoice-email.ts):
 *
 *   GET    /api/companies/:companyId/salesperson-mappings
 *   POST   /api/companies/:companyId/salesperson-mappings
 *   PATCH  /api/companies/:companyId/salesperson-mappings/:mappingId
 *   DELETE /api/companies/:companyId/salesperson-mappings/:mappingId
 *   GET    /api/companies/:companyId/salesperson-options
 *   GET    /api/companies/:companyId/invoices
 *   GET    /api/companies/:companyId/invoice-settings
 *   POST   /api/companies/:companyId/invoice-settings
 *   PATCH  /api/companies/:companyId/invoice-settings
 *   POST   /api/invoices/:invoiceId/email
 *   POST   /api/invoices/send-multiple
 *
 * NOTA: No se expone creacion de facturas (POST /api/companies/:c/invoices)
 * porque la ruta no existe en el backend verificado. El listado
 * existente solo expone GET y lo materiales via InvoiceService.
 */
import { z } from 'zod';
import type { ToolDefinition } from '../tool-base.js';
import {
  ok,
  fail,
  resolveCompanyId,
  assertConfirmed,
} from '../tool-base.js';

const CompanyIdInput = z.object({
  companyId: z.number().int().positive().optional(),
});

// =====================================================================
// SALESPERSON MAPPINGS
// =====================================================================

const ListSalespersonMappingsInput = CompanyIdInput;

const CreateSalespersonMappingInput = CompanyIdInput.extend({
  salespersonId: z.string().min(1).max(100),
  salespersonName: z.string().min(1).max(200),
});

const UpdateSalespersonMappingInput = CompanyIdInput.extend({
  mappingId: z.number().int().positive(),
  salespersonId: z.string().min(1).max(100).optional(),
  salespersonName: z.string().min(1).max(200).optional(),
});

const DeleteSalespersonMappingInput = CompanyIdInput.extend({
  mappingId: z.number().int().positive(),
  confirm: z.boolean().optional(),
});

// =====================================================================
// SALESPERSON OPTIONS
// =====================================================================

const ListSalespersonOptionsInput = CompanyIdInput;

// =====================================================================
// INVOICES (solo lectura)
// =====================================================================

const InvoicesQueryInput = CompanyIdInput.extend({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  nit: z.string().min(1).max(50).optional(),
  numeroDocumento: z.string().min(1).max(100).optional(),
  tipoComprobante: z.string().min(1).max(10).optional(),
  codigoComprobante: z.string().min(1).max(50).optional(),
});

// =====================================================================
// INVOICE SETTINGS
// =====================================================================

const GetInvoiceSettingsInput = CompanyIdInput;

const WriteInvoiceSettingsInput = CompanyIdInput.extend({
  settings: z.record(z.unknown()),
});

// =====================================================================
// EMAIL: POST /api/invoices/:invoiceId/email
// =====================================================================

const SendInvoiceEmailInput = z.object({
  invoiceId: z.string().min(1).max(200),
  companyId: z.number().int().positive().optional(),
  email: z.string().min(1).max(200),
  customMessage: z.string().max(5000).optional(),
  portfolioCutoffDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, { message: 'Formato YYYY-MM-DD' })
    .optional(),
  confirm: z.boolean().optional(),
});

// =====================================================================
// EMAIL: POST /api/invoices/send-multiple
// =====================================================================

const SendInvoicesMultipleInput = z.object({
  companyId: z.number().int().positive().optional(),
  invoiceIds: z.array(z.string().min(1).max(200)).min(1).max(500),
  customMessage: z.string().max(5000).optional(),
  portfolioCutoffDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, { message: 'Formato YYYY-MM-DD' })
    .optional(),
  confirm: z.boolean().optional(),
});

// =====================================================================
// Handlers
// =====================================================================

const listSalespersonMappingsTool: ToolDefinition<typeof ListSalespersonMappingsInput> = {
  name: 'reportia_salesperson_mappings_list',
  description:
    'Lista los mapeos de vendedores (salespersonId <-> salespersonName) de una empresa.',
  inputSchema: ListSalespersonMappingsInput,
  handler: async (input, ctx) => {
    try {
      const companyId = resolveCompanyId(input, ctx);
      const data = await ctx.client.call<unknown>(
        `/api/companies/${companyId}/salesperson-mappings`,
        { method: 'GET' },
      );
      return ok(data);
    } catch (err) {
      return fail(err);
    }
  },
};

const createSalespersonMappingTool: ToolDefinition<typeof CreateSalespersonMappingInput> = {
  name: 'reportia_salesperson_mapping_create',
  description:
    'Crea un nuevo mapeo de vendedor para una empresa. Body: salespersonId, salespersonName.',
  inputSchema: CreateSalespersonMappingInput,
  handler: async (input, ctx) => {
    try {
      const companyId = resolveCompanyId(input, ctx);
      const data = await ctx.client.call<unknown>(
        `/api/companies/${companyId}/salesperson-mappings`,
        {
          method: 'POST',
          body: {
            salespersonId: input.salespersonId,
            salespersonName: input.salespersonName,
          },
        },
      );
      return ok(data);
    } catch (err) {
      return fail(err);
    }
  },
};

const updateSalespersonMappingTool: ToolDefinition<typeof UpdateSalespersonMappingInput> = {
  name: 'reportia_salesperson_mapping_update',
  description:
    'Actualiza parcialmente un mapeo de vendedor (PATCH /:mappingId).',
  inputSchema: UpdateSalespersonMappingInput,
  handler: async (input, ctx) => {
    try {
      const companyId = resolveCompanyId(input, ctx);
      const body: Record<string, unknown> = {};
      if (input.salespersonId !== undefined) body.salespersonId = input.salespersonId;
      if (input.salespersonName !== undefined) body.salespersonName = input.salespersonName;
      const data = await ctx.client.call<unknown>(
        `/api/companies/${companyId}/salesperson-mappings/${input.mappingId}`,
        { method: 'PATCH', body },
      );
      return ok(data);
    } catch (err) {
      return fail(err);
    }
  },
};

const deleteSalespersonMappingTool: ToolDefinition<typeof DeleteSalespersonMappingInput> = {
  name: 'reportia_salesperson_mapping_delete',
  description:
    'Elimina un mapeo de vendedor. DESTRUCTIVA: requiere { confirm: true }.',
  inputSchema: DeleteSalespersonMappingInput,
  destructive: true,
  handler: async (input, ctx) => {
    try {
      assertConfirmed(input, 'reportia_salesperson_mapping_delete');
      const companyId = resolveCompanyId(input, ctx);
      const data = await ctx.client.call<unknown>(
        `/api/companies/${companyId}/salesperson-mappings/${input.mappingId}`,
        { method: 'DELETE' },
      );
      return ok(data);
    } catch (err) {
      return fail(err);
    }
  },
};

const listSalespersonOptionsTool: ToolDefinition<typeof ListSalespersonOptionsInput> = {
  name: 'reportia_salesperson_options_list',
  description:
    'Lista las opciones de vendedores (dropdown) para una empresa: id, name, displayValue.',
  inputSchema: ListSalespersonOptionsInput,
  handler: async (input, ctx) => {
    try {
      const companyId = resolveCompanyId(input, ctx);
      const data = await ctx.client.call<unknown>(
        `/api/companies/${companyId}/salesperson-options`,
        { method: 'GET' },
      );
      return ok(data);
    } catch (err) {
      return fail(err);
    }
  },
};

// =====================================================================
// INVOICES (list)
// =====================================================================

const listInvoicesTool: ToolDefinition<typeof InvoicesQueryInput> = {
  name: 'reportia_invoices_list',
  description:
    'Lista las facturas de una empresa con filtros opcionales: startDate, endDate, nit, numeroDocumento, tipoComprobante, codigoComprobante.',
  inputSchema: InvoicesQueryInput,
  handler: async (input, ctx) => {
    try {
      const companyId = resolveCompanyId(input, ctx);
      const data = await ctx.client.call<unknown>(
        `/api/companies/${companyId}/invoices`,
        {
          method: 'GET',
          query: {
            startDate: input.startDate,
            endDate: input.endDate,
            nit: input.nit,
            numeroDocumento: input.numeroDocumento,
            tipoComprobante: input.tipoComprobante,
            codigoComprobante: input.codigoComprobante,
          },
        },
      );
      return ok(data);
    } catch (err) {
      return fail(err);
    }
  },
};

// =====================================================================
// INVOICE SETTINGS
// =====================================================================

const getInvoiceSettingsTool: ToolDefinition<typeof GetInvoiceSettingsInput> = {
  name: 'reportia_invoice_settings_get',
  description:
    'Obtiene la configuracion de facturacion (titulo, footer, proveedor de email, etc.) de una empresa.',
  inputSchema: GetInvoiceSettingsInput,
  handler: async (input, ctx) => {
    try {
      const companyId = resolveCompanyId(input, ctx);
      const data = await ctx.client.call<unknown>(
        `/api/companies/${companyId}/invoice-settings`,
        { method: 'GET' },
      );
      return ok(data);
    } catch (err) {
      return fail(err);
    }
  },
};

const createOrUpdateInvoiceSettingsTool: ToolDefinition<typeof WriteInvoiceSettingsInput> = {
  name: 'reportia_invoice_settings_create',
  description:
    'Crea o reemplaza la configuracion de facturacion (POST). El body libre es un record<string, unknown> aceptado por la API.',
  inputSchema: WriteInvoiceSettingsInput,
  handler: async (input, ctx) => {
    try {
      const companyId = resolveCompanyId(input, ctx);
      const data = await ctx.client.call<unknown>(
        `/api/companies/${companyId}/invoice-settings`,
        { method: 'POST', body: input.settings },
      );
      return ok(data);
    } catch (err) {
      return fail(err);
    }
  },
};

const patchInvoiceSettingsTool: ToolDefinition<typeof WriteInvoiceSettingsInput> = {
  name: 'reportia_invoice_settings_update',
  description:
    'Actualiza parcialmente la configuracion de facturacion (PATCH). El body libre es un record<string, unknown> aceptado por la API.',
  inputSchema: WriteInvoiceSettingsInput,
  handler: async (input, ctx) => {
    try {
      const companyId = resolveCompanyId(input, ctx);
      const data = await ctx.client.call<unknown>(
        `/api/companies/${companyId}/invoice-settings`,
        { method: 'PATCH', body: input.settings },
      );
      return ok(data);
    } catch (err) {
      return fail(err);
    }
  },
};

// =====================================================================
// EMAIL
// =====================================================================

const sendInvoiceEmailTool: ToolDefinition<typeof SendInvoiceEmailInput> = {
  name: 'reportia_invoice_email_send',
  description:
    'Envia UNA factura por email a un destinatario explicito. DESTRUCTIVA: requiere { confirm: true }. Envuelve POST /api/invoices/:invoiceId/email.',
  inputSchema: SendInvoiceEmailInput,
  destructive: true,
  handler: async (input, ctx) => {
    try {
      assertConfirmed(input, 'reportia_invoice_email_send');
      const companyId = resolveCompanyId(input, ctx);
      // Body libre pero acotado: la API exige companyId, email, customMessage, portfolioCutoffDate.
      const body: Record<string, unknown> = {
        email: input.email,
      };
      if (input.customMessage !== undefined) body.customMessage = input.customMessage;
      if (input.portfolioCutoffDate !== undefined) {
        body.portfolioCutoffDate = input.portfolioCutoffDate;
      }
      const data = await ctx.client.call<unknown>(
        `/api/invoices/${encodeURIComponent(input.invoiceId)}/email`,
        {
          method: 'POST',
          query: { companyId },
          body,
        },
      );
      return ok(data);
    } catch (err) {
      return fail(err);
    }
  },
};

const sendInvoicesMultipleTool: ToolDefinition<typeof SendInvoicesMultipleInput> = {
  name: 'reportia_invoices_send_multiple',
  description:
    'Envia VARIAS facturas por email usando la libreta de direcciones del cliente. DESTRUCTIVA: requiere { confirm: true }. Envuelve POST /api/invoices/send-multiple.',
  inputSchema: SendInvoicesMultipleInput,
  destructive: true,
  handler: async (input, ctx) => {
    try {
      assertConfirmed(input, 'reportia_invoices_send_multiple');
      const companyId = resolveCompanyId(input, ctx);
      const body: Record<string, unknown> = {
        companyId,
        invoiceIds: input.invoiceIds,
      };
      if (input.customMessage !== undefined) body.customMessage = input.customMessage;
      if (input.portfolioCutoffDate !== undefined) {
        body.portfolioCutoffDate = input.portfolioCutoffDate;
      }
      const data = await ctx.client.call<unknown>(
        `/api/invoices/send-multiple`,
        { method: 'POST', body },
      );
      return ok(data);
    } catch (err) {
      return fail(err);
    }
  },
};

export const salespersonInvoiceTools: ToolDefinition<any>[] = [
  listSalespersonMappingsTool,
  createSalespersonMappingTool,
  updateSalespersonMappingTool,
  deleteSalespersonMappingTool,
  listSalespersonOptionsTool,
  listInvoicesTool,
  getInvoiceSettingsTool,
  createOrUpdateInvoiceSettingsTool,
  patchInvoiceSettingsTool,
  sendInvoiceEmailTool,
  sendInvoicesMultipleTool,
];

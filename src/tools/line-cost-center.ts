/**
 * Herramientas MCP para mapeos de líneas/grupos, mapeos de centros de costo y
 * reportes configurables de centros de costo de Reportia.
 *
 * Rutas verificadas contra `C:\james\Reportia\server\routes.ts` y
 * `server/routes/*.ts`. Únicamente endpoints reales. Los schemas Zod
 * reflejan los campos documentados en `shared/schema.ts` y
 * `server/services/custom-cost-center-report-service.ts`.
 *
 * Endpoints cubiertos:
 *
 *  Mapeos línea/grupo (HU relacionada):
 *    GET    /api/companies/:companyId/line-group-mappings
 *    POST   /api/companies/:companyId/line-group-mappings
 *    PUT    /api/companies/:companyId/line-group-mappings/:id
 *    DELETE /api/companies/:companyId/line-group-mappings/:id
 *    GET    /api/companies/:companyId/line-group-mappings/suggestions/lines-groups
 *    GET    /api/companies/:companyId/line-group-mappings/suggestions/:type  (type ∈ {lines, groups})
 *    GET    /api/companies/:companyId/line-group-mappings/description?line=&group=
 *
 *  Mapeos centro de costo:
 *    GET    /api/companies/:companyId/cost-center-mappings
 *    POST   /api/companies/:companyId/cost-center-mappings
 *    PUT    /api/companies/:companyId/cost-center-mappings/:id
 *    DELETE /api/companies/:companyId/cost-center-mappings/:id
 *    GET    /api/companies/:companyId/cost-center-mappings/suggestions
 *    GET    /api/companies/:companyId/cost-centers/available
 *
 *  Reportes configurables de centros de costo:
 *    GET    /api/companies/:companyId/cost-center-reports
 *    POST   /api/companies/:companyId/cost-center-reports
 *    GET    /api/companies/:companyId/cost-center-reports/:reportId
 *    PUT    /api/companies/:companyId/cost-center-reports/:reportId
 *    DELETE /api/companies/:companyId/cost-center-reports/:reportId
 *    POST   /api/companies/:companyId/cost-center-reports/:reportId/execute
 *    POST   /api/companies/:companyId/cost-center-reports/:reportId/duplicate
 *    GET    /api/companies/:companyId/cost-center-reports/:reportId/export/excel
 *    GET    /api/companies/:companyId/cost-center-reports/:reportId/export/pdf
 */
import { z } from 'zod';
import type { ToolDefinition } from '../tool-base.js';
import {
  ok,
  fail,
  resolveCompanyId,
  assertConfirmed,
  IsoDateString,
} from '../tool-base.js';

// ─── Schemas base ────────────────────────────────────────────────────────────

const CompanyIdInput = z.object({
  companyId: z.number().int().positive().optional(),
});

/** `type` param válido para /line-group-mappings/suggestions/:type (ver routes.ts). */
const SuggestionType = z.enum(['lines', 'groups']);

/** Tipos de operación sobre débitos/créditos (ver createReportSchema). */
const ReportOperation = z.enum(['ADD', 'SUBTRACT', 'IGNORE']);

const ReportLineInput = z.object({
  costCenterCode: z.string().trim().min(1),
  subCenterCode: z.string().default(''),
  debitOperation: ReportOperation.default('ADD'),
  creditOperation: ReportOperation.default('SUBTRACT'),
  displayOrder: z.number().int().min(0).max(10000).default(0),
  sectionName: z.string().max(100).optional(),
});

const CreateReportInput = CompanyIdInput.extend({
  name: z.string().min(3).max(255),
  description: z.string().max(1000).optional(),
  chartType: z.enum(['bar', 'line', 'pie']).default('bar'),
  lines: z.array(ReportLineInput).min(1),
});

const UpdateReportInput = CompanyIdInput.extend({
  reportId: z.number().int().positive(),
  name: z.string().min(3).max(255),
  description: z.string().max(1000).optional(),
  chartType: z.enum(['bar', 'line', 'pie']).default('bar'),
  lines: z.array(ReportLineInput).min(1),
});

const DateQueryInput = CompanyIdInput.extend({
  startDate: IsoDateString,
  endDate: IsoDateString,
});

// ─── Line-Group Mappings ─────────────────────────────────────────────────────

const ListLineGroupMappingsInput = CompanyIdInput;

const CreateLineGroupMappingInput = CompanyIdInput.extend({
  line: z.string().min(1),
  group: z.string().min(1),
  description: z.string().optional(),
});

const UpdateLineGroupMappingInput = CompanyIdInput.extend({
  // mappingId segun backend es numerico (verificado en routes/line-group-mappings.ts).
  mappingId: z.number().int().positive(),
  line: z.string().min(1).optional(),
  group: z.string().min(1).optional(),
  description: z.string().optional(),
});

const DeleteLineGroupMappingInput = CompanyIdInput.extend({
  mappingId: z.number().int().positive(),
  confirm: z.boolean().optional(),
});

const SuggestionsTypeInput = CompanyIdInput.extend({
  type: SuggestionType,
});

const DescriptionInput = CompanyIdInput.extend({
  line: z.string().min(1),
  group: z.string().min(1),
});

// ─── Cost-Center Mappings ────────────────────────────────────────────────────

const ListCostCenterMappingsInput = CompanyIdInput;

const CreateCostCenterMappingInput = CompanyIdInput.extend({
  centerCode: z.string().min(1),
  subCenterCode: z.string().default(''),
  name: z.string().min(1),
});

const UpdateCostCenterMappingInput = CompanyIdInput.extend({
  mappingId: z.number().int().positive(),
  centerCode: z.string().min(1).optional(),
  subCenterCode: z.string().optional(),
  name: z.string().min(1).optional(),
});

const DeleteCostCenterMappingInput = CompanyIdInput.extend({
  mappingId: z.number().int().positive(),
  confirm: z.boolean().optional(),
});

// ─── Cost-Center Reports ─────────────────────────────────────────────────────

const ReportIdInput = CompanyIdInput.extend({
  reportId: z.number().int().positive(),
});

const ExecuteReportInput = DateQueryInput.extend({
  reportId: z.number().int().positive(),
});

const DuplicateReportInput = CompanyIdInput.extend({
  reportId: z.number().int().positive(),
  newName: z.string().min(3).max(255),
});

const DeleteReportInput = CompanyIdInput.extend({
  reportId: z.number().int().positive(),
  confirm: z.boolean().optional(),
});

// ─── Tools ───────────────────────────────────────────────────────────────────

// 1) Line-group mappings ────────────────────────────────────────────────────

const ListLineGroupMappingsTool: ToolDefinition = {
  name: 'reportia_line_group_mappings_list',
  description: 'Lista los mapeos de líneas/grupos configurados para una empresa.',
  inputSchema: ListLineGroupMappingsInput,
  handler: async (input, ctx) => {
    try {
      const companyId = resolveCompanyId(input, ctx);
      const data = await ctx.client.call(
        `/api/companies/${companyId}/line-group-mappings`,
        { method: 'GET' },
      );
      return ok(data);
    } catch (err) {
      return fail(err);
    }
  },
};

const CreateLineGroupMappingTool: ToolDefinition = {
  name: 'reportia_line_group_mapping_create',
  description:
    'Crea un mapeo de línea/grupo para una empresa. Campos: line, group (mín 1 car), description opcional.',
  inputSchema: CreateLineGroupMappingInput,
  handler: async (input, ctx) => {
    try {
      const companyId = resolveCompanyId(input, ctx);
      const data = await ctx.client.call(
        `/api/companies/${companyId}/line-group-mappings`,
        { method: 'POST', body: { line: input.line, group: input.group, description: input.description } },
      );
      return ok(data);
    } catch (err) {
      return fail(err);
    }
  },
};

const UpdateLineGroupMappingTool: ToolDefinition = {
  name: 'reportia_line_group_mapping_update',
  description:
    'Actualiza un mapeo de línea/grupo existente (PUT). Los campos son opcionales: line, group, description.',
  inputSchema: UpdateLineGroupMappingInput,
  handler: async (input, ctx) => {
    try {
      const companyId = resolveCompanyId(input, ctx);
      const body: Record<string, unknown> = {};
      if (input.line !== undefined) body.line = input.line;
      if (input.group !== undefined) body.group = input.group;
      if (input.description !== undefined) body.description = input.description;
      const data = await ctx.client.call(
        `/api/companies/${companyId}/line-group-mappings/${encodeURIComponent(input.mappingId)}`,
        { method: 'PUT', body },
      );
      return ok(data);
    } catch (err) {
      return fail(err);
    }
  },
};

const DeleteLineGroupMappingTool: ToolDefinition = {
  name: 'reportia_line_group_mapping_delete',
  description:
    'Elimina un mapeo de línea/grupo (DELETE). REQUIERE { confirm: true } — operación destructiva.',
  inputSchema: DeleteLineGroupMappingInput,
  destructive: true,
  handler: async (input, ctx) => {
    try {
      assertConfirmed(input, 'reportia_line_group_mapping_delete');
      const companyId = resolveCompanyId(input, ctx);
      const data = await ctx.client.call(
        `/api/companies/${companyId}/line-group-mappings/${encodeURIComponent(input.mappingId)}`,
        { method: 'DELETE' },
      );
      return ok(data ?? 'Mapeo de línea/grupo eliminado.');
    } catch (err) {
      return fail(err);
    }
  },
};

const SuggestionsLinesGroupsTool: ToolDefinition = {
  name: 'reportia_line_group_suggestions_lines_groups',
  description:
    'Devuelve sugerencias de líneas y grupos derivadas de los movimientos contables de la empresa.',
  inputSchema: ListLineGroupMappingsInput,
  handler: async (input, ctx) => {
    try {
      const companyId = resolveCompanyId(input, ctx);
      const data = await ctx.client.call(
        `/api/companies/${companyId}/line-group-mappings/suggestions/lines-groups`,
        { method: 'GET' },
      );
      return ok(data);
    } catch (err) {
      return fail(err);
    }
  },
};

const SuggestionsByTypeTool: ToolDefinition = {
  name: 'reportia_line_group_suggestions_by_type',
  description:
    'Devuelve sugerencias filtradas por tipo. type debe ser exactamente "lines" o "groups" (verificado en backend).',
  inputSchema: SuggestionsTypeInput,
  handler: async (input, ctx) => {
    try {
      const companyId = resolveCompanyId(input, ctx);
      const data = await ctx.client.call(
        `/api/companies/${companyId}/line-group-mappings/suggestions/${input.type}`,
        { method: 'GET' },
      );
      return ok(data);
    } catch (err) {
      return fail(err);
    }
  },
};

const DescriptionByLineGroupTool: ToolDefinition = {
  name: 'reportia_line_group_description',
  description:
    'Devuelve la descripción asociada a un par (line, group) ya mapeado para la empresa.',
  inputSchema: DescriptionInput,
  handler: async (input, ctx) => {
    try {
      const companyId = resolveCompanyId(input, ctx);
      const data = await ctx.client.call(
        `/api/companies/${companyId}/line-group-mappings/description`,
        { method: 'GET', query: { line: input.line, group: input.group } },
      );
      return ok(data);
    } catch (err) {
      return fail(err);
    }
  },
};

// 2) Cost-center mappings ───────────────────────────────────────────────────

const ListCostCenterMappingsTool: ToolDefinition = {
  name: 'reportia_cost_center_mappings_list',
  description: 'Lista los mapeos de centros de costo para una empresa.',
  inputSchema: ListCostCenterMappingsInput,
  handler: async (input, ctx) => {
    try {
      const companyId = resolveCompanyId(input, ctx);
      const data = await ctx.client.call(
        `/api/companies/${companyId}/cost-center-mappings`,
        { method: 'GET' },
      );
      return ok(data);
    } catch (err) {
      return fail(err);
    }
  },
};

const CreateCostCenterMappingTool: ToolDefinition = {
  name: 'reportia_cost_center_mapping_create',
  description:
    'Crea un mapeo de centro de costo. Campos: centerCode, name (mín 1 car), subCenterCode opcional (default "").',
  inputSchema: CreateCostCenterMappingInput,
  handler: async (input, ctx) => {
    try {
      const companyId = resolveCompanyId(input, ctx);
      const data = await ctx.client.call(
        `/api/companies/${companyId}/cost-center-mappings`,
        {
          method: 'POST',
          body: {
            centerCode: input.centerCode,
            subCenterCode: input.subCenterCode,
            name: input.name,
          },
        },
      );
      return ok(data);
    } catch (err) {
      return fail(err);
    }
  },
};

const UpdateCostCenterMappingTool: ToolDefinition = {
  name: 'reportia_cost_center_mapping_update',
  description:
    'Actualiza un mapeo de centro de costo existente (PUT). Campos opcionales: centerCode, subCenterCode, name.',
  inputSchema: UpdateCostCenterMappingInput,
  handler: async (input, ctx) => {
    try {
      const companyId = resolveCompanyId(input, ctx);
      const body: Record<string, unknown> = {};
      if (input.centerCode !== undefined) body.centerCode = input.centerCode;
      if (input.subCenterCode !== undefined) body.subCenterCode = input.subCenterCode;
      if (input.name !== undefined) body.name = input.name;
      const data = await ctx.client.call(
        `/api/companies/${companyId}/cost-center-mappings/${encodeURIComponent(input.mappingId)}`,
        { method: 'PUT', body },
      );
      return ok(data);
    } catch (err) {
      return fail(err);
    }
  },
};

const DeleteCostCenterMappingTool: ToolDefinition = {
  name: 'reportia_cost_center_mapping_delete',
  description:
    'Elimina un mapeo de centro de costo (DELETE). REQUIERE { confirm: true } — operación destructiva.',
  inputSchema: DeleteCostCenterMappingInput,
  destructive: true,
  handler: async (input, ctx) => {
    try {
      assertConfirmed(input, 'reportia_cost_center_mapping_delete');
      const companyId = resolveCompanyId(input, ctx);
      const data = await ctx.client.call(
        `/api/companies/${companyId}/cost-center-mappings/${encodeURIComponent(input.mappingId)}`,
        { method: 'DELETE' },
      );
      return ok(data ?? 'Mapeo de centro de costo eliminado.');
    } catch (err) {
      return fail(err);
    }
  },
};

const CostCenterSuggestionsTool: ToolDefinition = {
  name: 'reportia_cost_center_mappings_suggestions',
  description: 'Devuelve sugerencias de centros de costo desde los movimientos contables de la empresa.',
  inputSchema: ListCostCenterMappingsInput,
  handler: async (input, ctx) => {
    try {
      const companyId = resolveCompanyId(input, ctx);
      const data = await ctx.client.call(
        `/api/companies/${companyId}/cost-center-mappings/suggestions`,
        { method: 'GET' },
      );
      return ok(data);
    } catch (err) {
      return fail(err);
    }
  },
};

const AvailableCostCentersTool: ToolDefinition = {
  name: 'reportia_cost_centers_available',
  description:
    'Lista todos los centros de costo disponibles de la empresa (usado por el wizard de creación de reportes).',
  inputSchema: ListCostCenterMappingsInput,
  handler: async (input, ctx) => {
    try {
      const companyId = resolveCompanyId(input, ctx);
      const data = await ctx.client.call(
        `/api/companies/${companyId}/cost-centers/available`,
        { method: 'GET' },
      );
      return ok(data);
    } catch (err) {
      return fail(err);
    }
  },
};

// 3) Cost-center reports ────────────────────────────────────────────────────

const ListCostCenterReportsTool: ToolDefinition = {
  name: 'reportia_cost_center_reports_list',
  description: 'Lista los reportes configurables de centros de costo para una empresa.',
  inputSchema: CompanyIdInput,
  handler: async (input, ctx) => {
    try {
      const companyId = resolveCompanyId(input, ctx);
      const data = await ctx.client.call(
        `/api/companies/${companyId}/cost-center-reports`,
        { method: 'GET' },
      );
      return ok(data);
    } catch (err) {
      return fail(err);
    }
  },
};

const GetCostCenterReportTool: ToolDefinition = {
  name: 'reportia_cost_center_report_get',
  description: 'Detalle de un reporte configurable de centros de costo con sus líneas.',
  inputSchema: ReportIdInput,
  handler: async (input, ctx) => {
    try {
      const companyId = resolveCompanyId(input, ctx);
      const data = await ctx.client.call(
        `/api/companies/${companyId}/cost-center-reports/${input.reportId}`,
        { method: 'GET' },
      );
      return ok(data);
    } catch (err) {
      return fail(err);
    }
  },
};

const CreateCostCenterReportTool: ToolDefinition = {
  name: 'reportia_cost_center_report_create',
  description:
    'Crea un reporte configurable de centros de costo con sus líneas. chartType ∈ {bar, line, pie}; operaciones por línea ∈ {ADD, SUBTRACT, IGNORE}.',
  inputSchema: CreateReportInput,
  handler: async (input, ctx) => {
    try {
      const companyId = resolveCompanyId(input, ctx);
      const body = {
        name: input.name,
        description: input.description,
        chartType: input.chartType,
        lines: input.lines.map((l: z.infer<typeof ReportLineInput>) => ({
          costCenterCode: l.costCenterCode,
          subCenterCode: l.subCenterCode,
          debitOperation: l.debitOperation,
          creditOperation: l.creditOperation,
          displayOrder: l.displayOrder,
          sectionName: l.sectionName,
        })),
      };
      const data = await ctx.client.call(
        `/api/companies/${companyId}/cost-center-reports`,
        { method: 'POST', body },
      );
      return ok(data);
    } catch (err) {
      return fail(err);
    }
  },
};

const UpdateCostCenterReportTool: ToolDefinition = {
  name: 'reportia_cost_center_report_update',
  description: 'Reemplaza un reporte y todas sus líneas (PUT). Mismo body que create.',
  inputSchema: UpdateReportInput,
  handler: async (input, ctx) => {
    try {
      const companyId = resolveCompanyId(input, ctx);
      const body = {
        name: input.name,
        description: input.description,
        chartType: input.chartType,
        lines: input.lines.map((l: z.infer<typeof ReportLineInput>) => ({
          costCenterCode: l.costCenterCode,
          subCenterCode: l.subCenterCode,
          debitOperation: l.debitOperation,
          creditOperation: l.creditOperation,
          displayOrder: l.displayOrder,
          sectionName: l.sectionName,
        })),
      };
      const data = await ctx.client.call(
        `/api/companies/${companyId}/cost-center-reports/${input.reportId}`,
        { method: 'PUT', body },
      );
      return ok(data);
    } catch (err) {
      return fail(err);
    }
  },
};

const DeleteCostCenterReportTool: ToolDefinition = {
  name: 'reportia_cost_center_report_delete',
  description:
    'Elimina un reporte de centros de costo y todas sus líneas (CASCADE). REQUIERE { confirm: true } — destructiva.',
  inputSchema: DeleteReportInput,
  destructive: true,
  handler: async (input, ctx) => {
    try {
      assertConfirmed(input, 'reportia_cost_center_report_delete');
      const companyId = resolveCompanyId(input, ctx);
      const data = await ctx.client.call(
        `/api/companies/${companyId}/cost-center-reports/${input.reportId}`,
        { method: 'DELETE' },
      );
      return ok(data ?? 'Reporte eliminado.');
    } catch (err) {
      return fail(err);
    }
  },
};

const ExecuteCostCenterReportTool: ToolDefinition = {
  name: 'reportia_cost_center_report_execute',
  description:
    'Ejecuta un reporte aplicando sus operaciones sobre los movimientos del rango [startDate, endDate] (YYYY-MM-DD). Puede ser costoso (consulta SQL sobre millones de filas). DESTRUCTIVA: requiere { confirm: true }.',
  inputSchema: ExecuteReportInput.extend({
    confirm: z.boolean().optional(),
  }),
  destructive: true,
  handler: async (input, ctx) => {
    try {
      assertConfirmed(input, 'reportia_cost_center_report_execute');
      if (input.startDate > input.endDate) {
        return fail({
          code: 'INVALID_DATE_RANGE',
          message: `startDate (${input.startDate}) debe ser <= endDate (${input.endDate})`,
        });
      }
      const companyId = resolveCompanyId(input, ctx);
      const data = await ctx.client.call(
        `/api/companies/${companyId}/cost-center-reports/${input.reportId}/execute`,
        { method: 'POST', body: { startDate: input.startDate, endDate: input.endDate } },
      );
      return ok(data);
    } catch (err) {
      return fail(err);
    }
  },
};

const DuplicateCostCenterReportTool: ToolDefinition = {
  name: 'reportia_cost_center_report_duplicate',
  description:
    'Duplica un reporte existente con un nuevo nombre (3-255 caracteres). Crea un reporte nuevo en el backend. DESTRUCTIVA: requiere { confirm: true }.',
  inputSchema: DuplicateReportInput.extend({
    confirm: z.boolean().optional(),
  }),
  destructive: true,
  handler: async (input, ctx) => {
    try {
      assertConfirmed(input, 'reportia_cost_center_report_duplicate');
      const companyId = resolveCompanyId(input, ctx);
      const data = await ctx.client.call(
        `/api/companies/${companyId}/cost-center-reports/${input.reportId}/duplicate`,
        { method: 'POST', body: { newName: input.newName } },
      );
      return ok(data);
    } catch (err) {
      return fail(err);
    }
  },
};

const ExportCostCenterReportExcelTool: ToolDefinition = {
  name: 'reportia_cost_center_report_export_excel',
  description:
    'Ejecuta el reporte y descarga el resultado como .xlsx (descarga segura). Requiere startDate y endDate.',
  inputSchema: ExecuteReportInput,
  handler: async (input, ctx) => {
    try {
      if (input.startDate > input.endDate) {
        return fail({
          code: 'INVALID_DATE_RANGE',
          message: `startDate (${input.startDate}) debe ser <= endDate (${input.endDate})`,
        });
      }
      const companyId = resolveCompanyId(input, ctx);
      const download = await ctx.client.download(
        `/api/companies/${companyId}/cost-center-reports/${input.reportId}/export/excel`,
        {
          method: 'GET',
          query: { startDate: input.startDate, endDate: input.endDate },
          suggestedFileName: 'reporte-centros-costo.xlsx',
        },
      );
      return ok(download);
    } catch (err) {
      return fail(err);
    }
  },
};

const ExportCostCenterReportPdfTool: ToolDefinition = {
  name: 'reportia_cost_center_report_export_pdf',
  description:
    'Ejecuta el reporte y descarga el resultado como .pdf (descarga segura). Requiere startDate y endDate.',
  inputSchema: ExecuteReportInput,
  handler: async (input, ctx) => {
    try {
      if (input.startDate > input.endDate) {
        return fail({
          code: 'INVALID_DATE_RANGE',
          message: `startDate (${input.startDate}) debe ser <= endDate (${input.endDate})`,
        });
      }
      const companyId = resolveCompanyId(input, ctx);
      const download = await ctx.client.download(
        `/api/companies/${companyId}/cost-center-reports/${input.reportId}/export/pdf`,
        {
          method: 'GET',
          query: { startDate: input.startDate, endDate: input.endDate },
          suggestedFileName: 'reporte-centros-costo.pdf',
        },
      );
      return ok(download);
    } catch (err) {
      return fail(err);
    }
  },
};

// ─── Export ──────────────────────────────────────────────────────────────────

export const lineGroupMappingTools: ToolDefinition[] = [
  ListLineGroupMappingsTool,
  CreateLineGroupMappingTool,
  UpdateLineGroupMappingTool,
  DeleteLineGroupMappingTool,
  SuggestionsLinesGroupsTool,
  SuggestionsByTypeTool,
  DescriptionByLineGroupTool,
];

export const costCenterMappingTools: ToolDefinition[] = [
  ListCostCenterMappingsTool,
  CreateCostCenterMappingTool,
  UpdateCostCenterMappingTool,
  DeleteCostCenterMappingTool,
  CostCenterSuggestionsTool,
  AvailableCostCentersTool,
];

export const costCenterReportTools: ToolDefinition[] = [
  ListCostCenterReportsTool,
  GetCostCenterReportTool,
  CreateCostCenterReportTool,
  UpdateCostCenterReportTool,
  DeleteCostCenterReportTool,
  ExecuteCostCenterReportTool,
  DuplicateCostCenterReportTool,
  ExportCostCenterReportExcelTool,
  ExportCostCenterReportPdfTool,
];

export const lineCostCenterTools: ToolDefinition[] = [
  ...lineGroupMappingTools,
  ...costCenterMappingTools,
  ...costCenterReportTools,
];
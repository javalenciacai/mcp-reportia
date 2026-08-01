/**
 * Registro central de herramientas MCP de Reportia.
 *
 * Cada modulo de `src/tools/*.ts` exporta un array `ToolDefinition[]`;
 * aqui se concatenan para que `server.ts` las registre contra el
 * `McpServer`. El orden determina el orden de exposicion en
 * `tools/list`.
 */
import { authHealthTools } from './auth-health.js';
import { companyTools } from './companies.js';
import { accountingMovementTools } from './accounting-movements.js';
import { accountMappingTools } from './account-mappings.js';
import { commissionReportTools } from './commission-reports.js';
import { thirdPartyTools } from './third-parties.js';
import { salespersonInvoiceTools } from './salesperson-invoice.js';
import { lineCostCenterTools } from './line-cost-center.js';
import { operationsTools } from './operations.js';

export const allTools = [
  ...authHealthTools,
  ...companyTools,
  ...accountingMovementTools,
  ...accountMappingTools,
  ...commissionReportTools,
  ...thirdPartyTools,
  ...salespersonInvoiceTools,
  ...lineCostCenterTools,
  ...operationsTools,
];

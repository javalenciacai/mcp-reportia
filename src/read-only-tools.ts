/**
 * Clasificación canónica de las tools para el perfil de solo lectura.
 *
 * Las tres listas son EXPLÍCITAS y no se derivan de `destructive`: esa bandera
 * no cubre las 11 mutantes sin bandera ni `logout`, y derivar de ahí dejaría
 * escrituras dentro del perfil. Un test de exhaustividad exige que cada tool
 * de `allTools` esté en una y solo una lista, de modo que una tool nueva
 * obliga a decidir su clasificación.
 *
 * Con `REPORTIA_READ_ONLY=true` el servidor registra solo `READ_ONLY_TOOLS`.
 */
import type { AnyToolDefinition } from './tool-base.js';

/** Tools de consulta que forman el perfil de solo lectura (orden alfabético). */
export const READ_ONLY_TOOLS: readonly string[] = [
  'reportia_account_codes_search',
  'reportia_account_mappings_list',
  'reportia_commission_export_excel',
  'reportia_commission_list',
  'reportia_companies_list',
  'reportia_company_get',
  'reportia_company_settings_get',
  'reportia_cost_center_mappings_list',
  'reportia_cost_center_mappings_suggestions',
  'reportia_cost_center_report_export_excel',
  'reportia_cost_center_report_export_pdf',
  'reportia_cost_center_report_get',
  'reportia_cost_center_reports_list',
  'reportia_cost_centers_available',
  'reportia_health',
  'reportia_health_queue_system',
  'reportia_health_workers',
  'reportia_invoices_list',
  'reportia_line_group_description',
  'reportia_line_group_mappings_list',
  'reportia_line_group_suggestions_by_type',
  'reportia_line_group_suggestions_lines_groups',
  'reportia_movements_export_excel',
  'reportia_movements_export_pdf',
  'reportia_movements_list',
  'reportia_salesperson_mappings_list',
  'reportia_salesperson_options_list',
  'reportia_siigo_run_trace_get',
  'reportia_siigo_schedules_list',
  'reportia_siigo_sync_runs_list',
  'reportia_third_parties_get_by_nit',
  'reportia_third_parties_list',
  'reportia_third_parties_portfolio_balance',
  'reportia_third_parties_search',
  'reportia_upload_status_get',
  'reportia_uploads_history_list',
  'reportia_whoami',
];

/**
 * Lecturas de configuración sensibles. Quedan FUERA del perfil; se pueden
 * reincorporar solo con evidencia de que su respuesta no expone datos sensibles.
 */
export const SENSITIVE_READ_TOOLS: readonly string[] = [
  'reportia_invoice_settings_get',
  'reportia_siigo_clients_list',
  'reportia_siigo_settings_get',
];

/** Tools mutantes (o con efecto operativo). Fuera del perfil. */
export const MUTATING_TOOLS: readonly string[] = [
  'reportia_account_mapping_create',
  'reportia_account_mapping_delete',
  'reportia_account_mapping_update',
  'reportia_company_activate',
  'reportia_company_settings_update',
  'reportia_cost_center_mapping_create',
  'reportia_cost_center_mapping_delete',
  'reportia_cost_center_mapping_update',
  'reportia_cost_center_report_create',
  'reportia_cost_center_report_delete',
  'reportia_cost_center_report_duplicate',
  'reportia_cost_center_report_execute',
  'reportia_cost_center_report_update',
  'reportia_invoice_email_send',
  'reportia_invoice_settings_create',
  'reportia_invoice_settings_update',
  'reportia_invoices_send_multiple',
  'reportia_line_group_mapping_create',
  'reportia_line_group_mapping_delete',
  'reportia_line_group_mapping_update',
  'reportia_logout',
  'reportia_movements_delete_all',
  'reportia_salesperson_mapping_create',
  'reportia_salesperson_mapping_delete',
  'reportia_salesperson_mapping_update',
  'reportia_siigo_history_get',
];

const READ_ONLY_SET: ReadonlySet<string> = new Set(READ_ONLY_TOOLS);

/** Forma del artefacto publicado `read-only-tools.json`. */
export interface ReadOnlyProfileArtifact {
  schemaVersion: 1;
  profile: 'read-only';
  tools: string[];
}

export function readOnlyProfileArtifact(): ReadOnlyProfileArtifact {
  return { schemaVersion: 1, profile: 'read-only', tools: [...READ_ONLY_TOOLS] };
}

/**
 * Tools que el servidor debe registrar según el perfil. Con `readOnly`, solo
 * las de `READ_ONLY_TOOLS` (conserva el orden de registro de `all`).
 */
export function toolsForProfile<T extends Pick<AnyToolDefinition, 'name'>>(
  all: readonly T[],
  cfg: { readOnly?: boolean },
): T[] {
  return cfg.readOnly ? all.filter((t) => READ_ONLY_SET.has(t.name)) : [...all];
}

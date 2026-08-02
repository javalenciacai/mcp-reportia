---
name: reportia-mcp-usage
description: >
  Guide for AI agents using the mcp-reportia MCP server. Covers tool selection,
  destructive operation confirmation flow, companyId resolution, IDOR safety,
  pagination, binary export handling, and known limits. Use when an AI
  client (Claude Code, Codex, OpenCode, Cursor, etc.) has the mcp-reportia
  MCP configured and is about to invoke reportia_* tools against a Reportia
  deployment.
license: MIT
metadata:
  author: javalenciacai
  version: "0.1.0"
---

## When to Use This Skill

Use this skill whenever you (the AI agent) detect that the `mcp-reportia`
MCP server is available in your tool list (any tool whose name starts with
`reportia_`). This skill is a guardrail, not a replacement for the
tools' own descriptions — read each tool's inputSchema before calling it.

## Core Conventions

### 1. CompanyId resolution

- Most tools accept `companyId` as **optional**.
- If you pass `companyId`, it must be a positive integer.
- If you omit it, the MCP uses the env var `REPORTIA_COMPANY_ID` if set.
- If neither is set, the tool fails with `MISSING_COMPANY_ID` and
  does NOT call the API. Prefer using `reportia_companies_list` first
  to discover valid IDs before guessing.

### 2. Destructive operations

Tools marked with `destructive: true` in the MCP server (you can see this
in the tool's metadata) require an explicit `confirm: true` flag in the
input. **Never** send `confirm: true` without showing the user the exact
parameters that will be sent (companyId, resource ID, what will be deleted).

The destructive tools are:
- `reportia_company_activate`
- `reportia_movements_delete_all`  (requires `confirmationText` matching
   the companyId, plus `acknowledgeRisk: true` plus `confirm: true`)
- `reportia_account_mapping_delete`
- `reportia_salesperson_mapping_delete`
- `reportia_line_group_mapping_delete`
- `reportia_cost_center_mapping_delete`
- `reportia_cost_center_report_delete`
- `reportia_invoice_email_send` and `reportia_invoices_send_multiple`
- `reportia_company_settings_update`
- `reportia_invoice_settings_create` and `reportia_invoice_settings_update`
- `reportia_cost_center_report_duplicate`
- `reportia_cost_center_report_execute`
- `reportia_siigo_history_get` (server may trigger sync on-demand)

If the LLM (you) sends a destructive tool without `confirm: true`, the
MCP returns a structured error with `code: "GUARD_REJECTED"` and does
NOT call the API.

### 3. Read-only tools

All `reportia_*_list`, `_get`, `_search`, `_settings_get`, `_history`,
`_trace`, `_sync_runs_list`, `_schedules_list`, `_clients_list` etc.
do not require confirmation. Use them freely.

### 4. Pagination

List endpoints accept `limit` (max 1000, default 100) and respect the
backend's pagination. For large reports, iterate with ascending
`limit` instead of requesting millions of rows at once.

### 5. Binary downloads (Excel/PDF)

Tools ending in `_export_excel`, `_export_pdf`, `_report_export_excel`,
`_report_export_pdf`, and `reportia_commission_export_excel` are
binary downloads. They:
- Save the file to `REPORTIA_DOWNLOAD_DIR` (default `./downloads`).
- Return `{ absolutePath, bytes, contentType, suggestedFileName }`.
- Cap at `REPORTIA_MAX_DOWNLOAD_BYTES` (default 100 MiB); downloads
  larger than this fail with `DOWNLOAD_TOO_LARGE`.

When you receive a download result, give the user the `absolutePath`
so they can open it. Do not try to parse the binary content as text.

### 6. Date inputs

All date filters (`startDate`, `endDate`, `cutoffDate`, `portfolioCutoffDate`)
must be strict ISO `YYYY-MM-DD`. The MCP rejects impossible dates
(2025-02-30, 2025-13-01) with `INVALID_INPUT`. For reports, `startDate`
must be `<= endDate` or the tool returns `INVALID_DATE_RANGE`.

### 7. NIT format

For Colombian-style NITs with thousands separators or verification
digit, use the form `900.123.456-7`. Allowed: letters, digits, `.`, `-`.
Slash, question mark, hash, spaces, and percent are rejected.

### 8. Response size & rate limits

- Each list endpoint returns at most the requested `limit` rows.
- There is no client-side rate limit; respect server-side 429 by
  backing off if you see it.
- Heavy exports (>100 MiB) fail fast with `DOWNLOAD_TOO_LARGE`.

## Error codes you will see

| Code                  | Meaning                                                |
| --------------------- | ------------------------------------------------------ |
| `INVALID_INPUT`       | Schema validation failed (Zod).                        |
| `GUARD_REJECTED`      | Destructive tool called without `confirm: true`.      |
| `MISSING_COMPANY_ID`  | Tool needs companyId, not provided and no default.     |
| `CONFIRMATION_MISMATCH` | `confirmationText` ID does not match companyId.       |
| `INVALID_DATE_RANGE`  | startDate > endDate.                                   |
| `AUTH_ERROR`          | 401/403 from Reportia. Check token/cookie.             |
| `NOT_FOUND`           | 404 from Reportia.                                     |
| `VALIDATION_ERROR`    | 400 from Reportia.                                     |
| `ROW_LIMIT_EXCEEDED`  | 422 with `totalRows` (Reportia hit its max-rows cap).  |
| `UNPROCESSABLE_ENTITY`| 422 without `totalRows` (validation error in backend). |
| `NETWORK_ERROR`       | Connection failure.                                    |
| `TIMEOUT`             | HTTP timeout (default 30s).                            |
| `DOWNLOAD_TOO_LARGE`  | Binary response exceeds `REPORTIA_MAX_DOWNLOAD_BYTES`. |
| `UNSAFE_FILENAME`     | Server-supplied filename triggered path-traversal guard. |

When you receive any of these, surface the `code`, the `message`, and the
relevant `endpoint` to the user — do not invent workarounds that bypass
the MCP and call Reportia directly.

## Configuration that the user must provide

The MCP server itself reads (in order of precedence):
1. Process env vars (`REPORTIA_BASE_URL`, `REPORTIA_TOKEN` or
   `REPORTIA_EMAIL`+`REPORTIA_PASSWORD`, `REPORTIA_COMPANY_ID`,
   `REPORTIA_TIMEOUT_MS`, `REPORTIA_DOWNLOAD_DIR`, `REPORTIA_USER_AGENT`,
   `REPORTIA_MAX_DOWNLOAD_BYTES`).
2. A `.env` file in the working directory.
3. No interactive prompt.

If you cannot reach the API, ask the user to verify their env vars
and confirm the Reportia deployment is reachable from where the MCP
runs. Never fabricate data — if a tool fails, report the error verbatim.

## When in doubt

1. Call `reportia_health` first — it returns the MCP client diagnostics
   and the API health without requiring auth.
2. Call `reportia_whoami` to confirm the active session.
3. Call `reportia_companies_list` to discover valid company IDs.
4. Only then proceed with domain-specific tools.
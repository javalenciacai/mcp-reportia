# Changelog

## v0.3.3 - 2026-09-11

### Defense in depth (REQ-MCP-OUTPUT-03, incident 2026-09-11)

The chat agent called `reportia_movements_list` WITHOUT `dateFrom`/`dateTo` even when the user specified a date range, then reported the date filter was broken. The upstream filter works correctly — verified via direct curl returning the expected 215 rows for Feb 1-2 on companyId=1. The failure mode was entirely LLM-side: the LLM mixed 19,604 unfiltered rows into the same context as 215 filtered rows and concluded the filter was broken.

This release adds a `NO_FILTER` warning in the response payload when the LLM calls without any row-narrowing filter. The warning is paired with a Cowork system-prompt change (separate PR) that bans no-filter calls when the user gave any date context.

- **`reportia_movements_list` response now carries a `warnings` field** (REQ-MCP-OUTPUT-03). The array is empty (omitted from the payload) when at least one of `dateFrom`, `dateTo`, `nit`, `numeroDocumento`, `tipoComprobante`, `emailStatus` is supplied. When none is supplied, the array contains a single `{ code: 'NO_FILTER', message: '...' }` entry that tells the LLM "you called without filters, that's probably wrong" — the loud-failure pattern that lets the LLM catch its own mistake without remembering prior calls.
- **No breaking changes to the `query` echo** (REQ-MCP-07 still works as before). The new `warnings` field is purely additive: clients that ignore it see no change.

## v0.3.2 - 2026-09-11

### Fixes

- **`downloadDir` default**: the default download path changed from `process.cwd()/downloads` to `os.tmpdir()/mcp-reportia`. The previous default assumed the cwd is writable, which fails with `EACCES` in containers where the cwd is `/app` and the filesystem is read-only (incident 2026-09-10). Operators who want a persistent path can still pin `REPORTIA_DOWNLOAD_DIR` to e.g. `/data/artifacts`.

### Improvements

- **`reportia_movements_list` response echoes the resolved query** (REQ-MCP-07). The response now wraps the upstream payload as `{ query, movements, total, limit, offset }` where `query` mirrors the resolved input filters (`companyId`, `dateFrom`, `dateTo`, `nit`, `numeroDocumento`, `tipoComprobante`, `emailStatus`, `limit`, `offset`). This lets the LLM verify each response against the exact call it just made. Loud-failure pattern from incident 2026-09-10 where the LLM confused two separate tool calls (different `limit` values) and reported the date filter was broken.
- **Tool description guidance** added to `reportia_movements_list`: when the expected row count is >5000, prefer `reportia_movements_export_excel` (writes to disk) instead of iterating with `limit` to avoid the stdio transport cap at the upstream.

## v0.3.1 â€” 2026-09-09

### BREAKING

- `reportia_movements_list`: input date params renamed from `startDate`/`endDate` to `dateFrom`/`dateTo` to match the upstream `GET /api/companies/:companyId/movements` contract. Calling the tool with `startDate` or `endDate` now fails zod validation with `Unrecognized key(s) in object: 'startDate'` (or `'endDate'`) â€” the schema is now `.strict()`. Migration: replace `startDate`/`endDate` with `dateFrom`/`dateTo` in every call to `reportia_movements_list`.
- `reportia_movements_export_excel` and `reportia_movements_export_pdf` are **unchanged** â€” they still accept `startDate`/`endDate` because the export endpoints (`/accounting-movements/export/{excel,pdf}`) still read those names.

### Internals

- `ExportInput` is now defined standalone (no `.extend` of `ListFiltersInput`) so the list-schema rename can never silently cascade into the export schema. A WHY comment above both schemas documents the contract split.
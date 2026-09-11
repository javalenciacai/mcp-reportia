# Changelog

## v0.3.4 - 2026-09-11

### Defense in depth, take 2 (REQ-MCP-OUTPUT-04, incident 2026-09-11 round 2)

The previous release (v0.3.3) added a `NO_FILTER` warning at the response level when `reportia_movements_list` was called without any row-narrowing filter. That was insufficient — the chat agent called without a filter 4 times in a row despite the warning, and the operator reported the filter was broken because the agent's diagnostic mixed unfiltered rows with the echoed query.

This release converts the warning into a **parse-time rejection**:

- **`reportia_movements_list` input schema now requires at least one of `dateFrom`, `dateTo`, `nit`, `numeroDocumento`, `tipoComprobante`, `emailStatus`**. A no-filter call (only `companyId` + pagination params) is rejected by the Zod schema with a structured error that names the missing filters.
- **Escape hatch**: a new `confirmBroadQuery: true` input parameter explicitly opts into a broad/unfiltered query. The default is `false`, so any LLM call without a row-narrowing filter is rejected unless the LLM deliberately sets `confirmBroadQuery: true`. The echo includes `query.confirmBroadQuery: true` so the LLM can see its own opt-in.
- **`NO_FILTER` warning** still fires (as a SECOND-LINE audit trail) when the call succeeds with `confirmBroadQuery: true` and no filter. The warning is no longer the first signal — the schema rejection is — but it's still useful for operators reading the request log.
- 12 new tests pin the REQ-MCP-OUTPUT-04 contract: the schema rejects no-filter payloads, accepts the `confirmBroadQuery: true` opt-in, and the warning fires only when the opt-in is explicit.
- One pre-existing security test (`tests/security.test.ts`) was updated to handle the chained `.strict().superRefine()` schema (the inner `.shape` is reachable via `_def.schema.shape`).

### Why this is the right defense in depth

The `NO_FILTER` warning was correct but insufficient because LLMs can ignore warnings under context pressure. Hard parse-time errors cannot be ignored — the call fails and the LLM must retry. Combined with v0.3.3's system-prompt change (in Cowork.CTis), the LLM is now told (soft) "don't do this" and the MCP layer rejects it (hard) when the LLM tries anyway.

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
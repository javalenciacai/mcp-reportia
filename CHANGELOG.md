# Changelog

## v0.3.1 — 2026-09-09

### BREAKING

- `reportia_movements_list`: input date params renamed from `startDate`/`endDate` to `dateFrom`/`dateTo` to match the upstream `GET /api/companies/:companyId/movements` contract. Calling the tool with `startDate` or `endDate` now fails zod validation with `Unrecognized key(s) in object: 'startDate'` (or `'endDate'`) — the schema is now `.strict()`. Migration: replace `startDate`/`endDate` with `dateFrom`/`dateTo` in every call to `reportia_movements_list`.
- `reportia_movements_export_excel` and `reportia_movements_export_pdf` are **unchanged** — they still accept `startDate`/`endDate` because the export endpoints (`/accounting-movements/export/{excel,pdf}`) still read those names.

### Internals

- `ExportInput` is now defined standalone (no `.extend` of `ListFiltersInput`) so the list-schema rename can never silently cascade into the export schema. A WHY comment above both schemas documents the contract split.
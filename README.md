# mcp-reportia

[![MCP Registry](https://img.shields.io/badge/MCP%20Registry-io.github.javalenciacai%2Fmcp--reportia-blue?logo=modelcontextprotocol)](https://registry.modelcontextprotocol.io)
[![skills.sh](https://img.shields.io/badge/skills.sh-javalenciacai%2Fmcp--reportia-7c3aed?logo=lightning)](https://skills.sh/javalenciacai/mcp-reportia)
[![npm](https://img.shields.io/npm/v/@james.valencia/mcp-reportia?logo=npm)](https://www.npmjs.com/package/@james.valencia/mcp-reportia)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

Servidor **[MCP](https://modelcontextprotocol.io/)** (Model Context Protocol) independiente que envuelve la **API HTTP real de Reportia** y la expone a través del transporte `stdio` con **JSON-RPC newline-delimited**. Pensado para ser consumido por clientes MCP (Claude Desktop, Cursor, Hermes Agent, otros) con un único `npx`, sin ejecutar código de servidor propio.

> Esta capa **no** contiene lógica de negocio ni secretos propios: actúa como traductor entre el protocolo MCP y los endpoints REST de Reportia. Las credenciales se inyectan desde variables de entorno.

---

## Índice

- [Dónde está indexado](#dónde-está-indexado)
- [Instalación y uso rápido](#instalación-y-uso-rápido)
- [Variables de entorno](#variables-de-entorno)
- [Configuración en clientes MCP](#configuración-en-clientes-mcp)
- [Herramientas disponibles](#herramientas-disponibles)
- [Limitaciones conocidas](#limitaciones-conocidas)
- [Rutas cubiertas y omitidas](#rutas-cubiertas-y-omitidas)
- [Desarrollo local](#desarrollo-local)
- [Pruebas](#pruebas)
- [Inspección con MCP Inspector](#inspección-con-mcp-inspector)
- [Arquitectura interna](#arquitectura-interna)
- [Seguridad](#seguridad)
- [Licencia](#licencia)

---

## Dónde está indexado

Este servidor MCP está publicado y discoverable en:

| Plataforma | URL | Formato |
| ---------- | --- | ------- |
| **MCP Registry oficial** (modelcontextprotocol.io) | `io.github.javalenciacai/mcp-reportia` | [`server.json`](./server.json) |
| **npm registry** | [`@james.valencia/mcp-reportia`](https://www.npmjs.com/package/@james.valencia/mcp-reportia) | npm package |
| **skills.sh** (Agent Skills Directory) | [`javalenciacai/mcp-reportia`](https://skills.sh/javalenciacai/mcp-reportia) | [`skills/reportia-mcp-usage/SKILL.md`](./skills/reportia-mcp-usage/SKILL.md) |

Instalación via skills.sh:
```bash
npx skills add javalenciacai/mcp-reportia --skill reportia-mcp-usage
```

---

## Instalación y uso rápido

Una vez publicado, el consumo típico es vía `npx`:

```bash
# 1) Construir dist/ localmente (la primera vez, o al actualizar):
npm run build

# 2) Ejecutar el binario MCP directamente:
npx mcp-reportia
```

Los clientes MCP (Claude Desktop, Cursor, Hermes, etc.) **lo invocan** por ti como subproceso. No necesitas ejecutarlo a mano salvo para depurar.

---

## Variables de entorno

| Variable                | Obligatoria          | Descripción                                                                                                                              |
| ----------------------- | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `REPORTIA_BASE_URL`     | **Sí**               | URL raíz de la API de Reportia, sin barra final (p.ej. `https://reportia.example.com`).                                                  |
| `REPORTIA_TOKEN`        | Condicional\*        | Token Bearer. Alternativa al login por sesión.                                                                                           |
| `REPORTIA_EMAIL`        | Condicional\*        | Email para login por sesión (cookie).                                                                                                    |
| `REPORTIA_PASSWORD`     | Condicional\*        | Contraseña para login por sesión (cookie).                                                                                               |
| `REPORTIA_COMPANY_ID`   | No                   | `companyId` por defecto cuando la tool lo admita. Acepta entero positivo.                                                                |
| `REPORTIA_TIMEOUT_MS`   | No (def. `30000`)    | Timeout por petición HTTP en ms.                                                                                                         |
| `REPORTIA_DOWNLOAD_DIR` | No (def. `./downloads`) | Carpeta donde se guardan los binarios descargados (Excel/PDF exportados).                                                              |
| `REPORTIA_USER_AGENT`   | No (def. `mcp-reportia/0.1.0`) | Cabecera `User-Agent` en cada request.                                                                                       |

\* **Exactamente una** de las dos alternativas de auth debe estar presente:

- `REPORTIA_TOKEN` Bearer, o
- `REPORTIA_EMAIL` + `REPORTIA_PASSWORD` sesión cookie.

Si no, `loadConfig` lanza `ConfigError` al arrancar el servidor.

> ⚠️ **No** copies credenciales de `C:\james\Reportia\.env` a este repositorio. Este proyecto **no debe** contener secretos. Configúralas en el entorno del cliente MCP que lo invoque.

Revisa `.env.example` para ver todas las variables.

---

## Configuración en clientes MCP

### Claude Desktop (`%APPDATA%\Claude\claude_desktop_config.json`)

Añade una entrada dentro de `mcpServers`:

```jsonc
{
  "mcpServers": {
    "reportia": {
      "command": "npx",
      "args": ["-y", "mcp-reportia"],
      "env": {
        "REPORTIA_BASE_URL": "https://reportia.example.com",
        "REPORTIA_TOKEN": "<tu-token>",
        "REPORTIA_COMPANY_ID": "123"
      }
    }
  }
}
```

> Sustituye `mcp-reportia` por la ruta local `C:\\james\\mcp-reportia` durante desarrollo, con `args: ["-y", "--prefix", "C:\\james\\mcp-reportia", "mcp-reportia"]` o ejecutando `npm run start` como comando directo.

### Cursor (`%USERPROFILE%\.cursor\mcp.json`)

```jsonc
{
  "mcpServers": {
    "reportia": {
      "command": "npx",
      "args": ["-y", "mcp-reportia"],
      "env": {
        "REPORTIA_BASE_URL": "https://reportia.example.com",
        "REPORTIA_TOKEN": "<tu-token>"
      }
    }
  }
}
```

### Hermes Agent (plugin MCP vía `~/.hermes/config.toml` o UI)

Añade un servidor MCP stdio de nombre `reportia` apuntando a `npx mcp-reportia` y exporta las variables en `env`.

Formato típico:

```toml
[[mcp_servers]]
name = "reportia"
command = "npx"
args = ["-y", "mcp-reportia"]
[mcp_servers.env]
REPORTIA_BASE_URL = "https://reportia.example.com"
REPORTIA_TOKEN    = "<tu-token>"
REPORTIA_COMPANY_ID = "123"
```

> El nombre exacto del campo varía según la versión de Hermes. Consulta `hermes mcp --help`.

---

## Herramientas disponibles

El servidor expone **66 herramientas** con el prefijo `reportia_`. Todas devuelven JSON (string con `JSON.stringify` pretty-print) y validan su input con Zod. Se agrupan por dominio funcional:

| Dominio | Módulo | Cantidad |
| ------- | ------ | -------- |
| Salud y autenticación | `src/tools/auth-health.ts` | 3 |
| Empresas | `src/tools/companies.ts` | 5 |
| Movimientos contables | `src/tools/accounting-movements.ts` | 4 |
| Mapeo de cuentas | `src/tools/account-mappings.ts` | 5 |
| Reportes de comisiones | `src/tools/commission-reports.ts` | 2 |
| Terceros | `src/tools/third-parties.ts` | 4 |
| Vendedor × factura | `src/tools/salesperson-invoice.ts` | 11 |
| Línea × centro de costo | `src/tools/line-cost-center.ts` | 22 |
| Operaciones (uploads, colas, SIIGO) | `src/tools/operations.ts` | 10 |
| **Total** | | **66** |

### Salud y autenticación (`src/tools/auth-health.ts`)

| Tool                 | Descripción                                                                 |
| -------------------- | --------------------------------------------------------------------------- |
| `reportia_health`    | Diagnóstico del cliente MCP + ping a `GET /api/health`.                     |
| `reportia_whoami`    | Perfil del usuario autenticado (`GET /api/auth/me`).                        |
| `reportia_logout`    | Cierra la sesión contra Reportia (`POST /api/auth/logout`).                 |

### Empresas (`src/tools/companies.ts`)

| Tool                                   | Tipo                | Descripción                                                                  |
| -------------------------------------- | ------------------- | ---------------------------------------------------------------------------- |
| `reportia_companies_list`              | Listado             | Lista empresas accesibles (`GET /api/companies`).                           |
| `reportia_company_get`                 | Detalle             | Detalle de una empresa (`GET /api/companies/:id`).                           |
| `reportia_company_settings_get`        | Configuración       | Settings de empresa (`GET /api/companies/:id/settings`).                     |
| `reportia_company_settings_update`     | Mutación            | Patch de settings (`PATCH /api/companies/:id/settings`).                     |
| `reportia_company_activate` ⚠️         | **Destructiva**     | Activa empresa (`POST /api/companies/:id/activate`). Requiere `confirm:true`. |

### Movimientos contables (`src/tools/accounting-movements.ts`)

| Tool                                       | Tipo            | Descripción                                                                  |
| ------------------------------------------ | --------------- | ---------------------------------------------------------------------------- |
| `reportia_movements_list`                  | Listado         | Lista movimientos con filtros y paginación.                                  |
| `reportia_movements_export_excel`          | Descarga binaria | Exporta movimientos a Excel y devuelve ruta local.                          |
| `reportia_movements_export_pdf`            | Descarga binaria | Exporta movimientos a PDF y devuelve ruta local.                            |
| `reportia_movements_delete_all` ⚠️         | **Destructiva** | Elimina todos los movimientos de la empresa. Requiere `confirm:true`.        |

### Mapeo de cuentas (`src/tools/account-mappings.ts`)

| Tool                                  | Tipo                | Descripción                                                                  |
| ------------------------------------- | ------------------- | ---------------------------------------------------------------------------- |
| `reportia_account_mappings_list`      | Listado             | Lista mapeos contables (`GET /api/companies/:companyId/account-mappings`).   |
| `reportia_account_mapping_create`     | Mutación            | Crea un mapeo (`POST /api/account-mappings`).                                |
| `reportia_account_mapping_update`     | Mutación            | Actualiza un mapeo (`PATCH /api/account-mappings/:mappingId`).               |
| `reportia_account_mapping_delete` ⚠️  | **Destructiva**     | Elimina un mapeo (`DELETE /api/account-mappings/:mappingId`). Requiere `confirm:true`. |
| `reportia_account_codes_search`       | Búsqueda            | Busca códigos contables para autocompletar (`GET /api/companies/:companyId/account-codes/search`). |

### Reportes de comisiones (`src/tools/commission-reports.ts`)

| Tool                                  | Tipo            | Descripción                                                                  |
| ------------------------------------- | --------------- | ---------------------------------------------------------------------------- |
| `reportia_commission_list`            | Listado         | Lista cálculos de comisión (`GET /api/commission-reports`).                 |
| `reportia_commission_export_excel`    | Descarga binaria | Exporta reporte de comisiones a Excel.                                       |

### Terceros (`src/tools/third-parties.ts`)

| Tool                                       | Tipo        | Descripción                                                                  |
| ------------------------------------------ | ----------- | ---------------------------------------------------------------------------- |
| `reportia_third_parties_list`              | Listado     | Lista terceros (clientes/proveedores).                                       |
| `reportia_third_parties_search`            | Búsqueda    | Búsqueda avanzada de terceros.                                               |
| `reportia_third_parties_get_by_nit`        | Detalle     | Obtiene un tercero por NIT.                                                  |
| `reportia_third_parties_portfolio_balance` | Resumen     | Balance de cartera por tercero.                                              |

### Vendedor × factura (`src/tools/salesperson-invoice.ts`)

Mapeos vendedor → factura, opciones de vendedor, listados de facturas, settings de factura y envío de facturas (email individual y masivo).

| Tool                                       | Tipo                | Descripción                                                                  |
| ------------------------------------------ | ------------------- | ---------------------------------------------------------------------------- |
| `reportia_salesperson_mappings_list`      | Listado             | Lista mapeos vendedor × factura de una empresa.                              |
| `reportia_salesperson_mapping_create`     | Mutación            | Crea un mapeo vendedor × factura.                                            |
| `reportia_salesperson_mapping_update`     | Mutación            | Actualiza un mapeo vendedor × factura.                                       |
| `reportia_salesperson_mapping_delete` ⚠️  | **Destructiva**     | Elimina un mapeo vendedor × factura. Requiere `confirm:true`.                |
| `reportia_salesperson_options_list`       | Listado             | Lista opciones de vendedor para selección / autocompletar.                   |
| `reportia_invoices_list`                  | Listado             | Lista facturas con filtros.                                                  |
| `reportia_invoice_settings_get`           | Configuración       | Lee la configuración de factura de una empresa.                              |
| `reportia_invoice_settings_create`        | Mutación            | Crea la configuración de factura.                                            |
| `reportia_invoice_settings_update`        | Mutación            | Actualiza la configuración de factura.                                       |
| `reportia_invoice_email_send`             | Notificación        | Envía una factura por email (servidor Reportia dispara el envío).            |
| `reportia_invoices_send_multiple`         | Notificación        | Envía varias facturas por email en una sola llamada.                         |

### Línea × centro de costo (`src/tools/line-cost-center.ts`)

Dominio más extenso: gestiona mapeos línea-grupo, mapeos centro de costo, centros de costo disponibles, y todo el ciclo de vida de los reportes de centro de costo (CRUD + ejecutar + duplicar + exportes).

| Tool                                              | Tipo                | Descripción                                                                  |
| ------------------------------------------------- | ------------------- | ---------------------------------------------------------------------------- |
| `reportia_line_group_mappings_list`               | Listado             | Lista mapeos línea-grupo.                                                    |
| `reportia_line_group_mapping_create`              | Mutación            | Crea un mapeo línea-grupo.                                                   |
| `reportia_line_group_mapping_update`              | Mutación            | Actualiza un mapeo línea-grupo.                                              |
| `reportia_line_group_mapping_delete` ⚠️           | **Destructiva**     | Elimina un mapeo línea-grupo. Requiere `confirm:true`.                       |
| `reportia_line_group_suggestions_lines_groups`    | Sugerencias         | Sugerencias de líneas-grupo para autocompletar.                              |
| `reportia_line_group_suggestions_by_type`         | Sugerencias         | Sugerencias de líneas-grupo filtradas por tipo.                              |
| `reportia_line_group_description`                 | Detalle             | Descripción legible de un mapeo línea-grupo.                                 |
| `reportia_cost_center_mappings_list`              | Listado             | Lista mapeos centro de costo.                                                |
| `reportia_cost_center_mapping_create`             | Mutación            | Crea un mapeo centro de costo.                                               |
| `reportia_cost_center_mapping_update`             | Mutación            | Actualiza un mapeo centro de costo.                                          |
| `reportia_cost_center_mapping_delete` ⚠️          | **Destructiva**     | Elimina un mapeo centro de costo. Requiere `confirm:true`.                   |
| `reportia_cost_center_mappings_suggestions`       | Sugerencias         | Sugerencias de mapeos centro de costo.                                       |
| `reportia_cost_centers_available`                 | Listado             | Centros de costo disponibles para una empresa.                               |
| `reportia_cost_center_reports_list`               | Listado             | Lista reportes de centro de costo.                                           |
| `reportia_cost_center_report_get`                 | Detalle             | Detalle de un reporte de centro de costo.                                     |
| `reportia_cost_center_report_create`              | Mutación            | Crea un reporte de centro de costo.                                          |
| `reportia_cost_center_report_update`              | Mutación            | Actualiza un reporte de centro de costo.                                     |
| `reportia_cost_center_report_delete` ⚠️           | **Destructiva**     | Elimina un reporte de centro de costo. Requiere `confirm:true`.              |
| `reportia_cost_center_report_execute`             | Ejecución           | Ejecuta un reporte de centro de costo.                                       |
| `reportia_cost_center_report_duplicate`           | Mutación            | Duplica un reporte de centro de costo (alias: copia).                         |
| `reportia_cost_center_report_export_excel`        | Descarga binaria     | Exporta el resultado del reporte a Excel.                                    |
| `reportia_cost_center_report_export_pdf`          | Descarga binaria     | Exporta el resultado del reporte a PDF.                                      |

### Operaciones (`src/tools/operations.ts`) — uploads, colas y SIIGO

Todas las tools de este módulo son **read-only**: historial/estado de uploads, salud del sistema de colas y de los workers, y herramientas de **consulta** sobre SIIGO (settings, clientes, corridas, trazas, schedules, historial). **No** hay tools de mutación, de subida `multipart/form-data`, ni de control de colas en esta versión.

| Tool                                       | Tipo            | Descripción                                                                  |
| ------------------------------------------ | --------------- | ---------------------------------------------------------------------------- |
| `reportia_uploads_history_list`            | Listado         | Historial de uploads de una empresa (`GET /api/companies/:companyId/upload-history`). |
| `reportia_upload_status_get`               | Detalle         | Estado de un upload específico (`GET /api/upload/:uploadId/status`).         |
| `reportia_health_queue_system`             | Diagnóstico     | Salud del sistema de colas (`GET /api/health/queue-system`).                 |
| `reportia_health_workers`                  | Diagnóstico     | Salud de los workers y lag de la cola (`GET /api/queue/workers/health`).      |
| `reportia_siigo_settings_get`              | Configuración   | Settings SIIGO Pyme de una empresa (`GET /api/companies/:companyId/siigo-settings`). |
| `reportia_siigo_clients_list`              | Listado         | Clientes remotos SIIGO disponibles para una empresa (`GET /api/companies/:companyId/siigo/clients`). |
| `reportia_siigo_sync_runs_list`            | Listado         | Corridas de sincronización SIIGO (`GET /api/companies/:companyId/siigo/sync/runs`). |
| `reportia_siigo_run_trace_get`             | Detalle         | Trazabilidad de una corrida SIIGO (`GET /api/companies/:companyId/siigo/sync/runs/:runId/trace`). |
| `reportia_siigo_schedules_list`            | Listado         | Schedules de sincronización SIIGO (`GET /api/companies/:companyId/siigo/schedules`). |
| `reportia_siigo_history_get`               | Historial       | Historial de comandos SIIGO (`GET /api/companies/:companyId/siigo/history`). |

> ⚠️ Las tools marcadas como **Destructiva** requieren el parámetro `{ "confirm": true }` en su input. Si no se envía, el handler valida con `assertConfirmed(input, '<tool-name>')` (definido en `src/tool-base.ts`) y devuelve un error con `code: "GUARD_REJECTED"` **antes** de cualquier llamada HTTP. El LLM debe pedir confirmación explícita al usuario antes de invocarlas.

`companyId` puede omitirse si configuraste `REPORTIA_COMPANY_ID`; en caso contrario, es obligatorio en todas las tools que tocan datos por empresa.

---

## Limitaciones conocidas

- **Sin HTTP streaming / SSE:** este servidor solo habla `stdio`. Clientes que solo soporten HTTP no pueden consumirlo directamente.
- **Una sola `ReportiaClient` por proceso:** el login es lazy y global; no se admite multi-cuenta simultánea.
- **Subida de archivos (`multipart/form-data`):** el cliente HTTP está preparado (`FormData` desde `undici`) pero las tools actuales **no exponen endpoints de upload** (no hay POST/PUT con `multipart/form-data`). Sí se exponen dos tools **read-only** sobre el histórico y estado de uploads existentes: `reportia_uploads_history_list` (GET `/api/companies/:companyId/upload-history`) y `reportia_upload_status_get` (GET `/api/upload/:uploadId/status`). Si Reportia añade en el futuro endpoints de carga, basta con añadir un ToolDefinition que use `ctx.client.call(..., { formData })`.
- **Sin caché persistente:** cada invocación vuelve a llamar a la API. El LLM debe sentirse libre de hacer `tools/list` cuando lo necesite.
- **Errores HTTP:** se traducen a tipos estructurados (`AUTH_ERROR`, `NOT_FOUND`, `VALIDATION_ERROR`, `ROW_LIMIT_EXCEEDED`, `NETWORK_ERROR`, `TIMEOUT`). El cliente nunca expone secretos en el mensaje.
- **Smoke test offline:** `npm run test:smoke` arranca el servidor con `REPORTIA_BASE_URL=http://127.0.0.1:9` (puerto cerrado). No hace llamadas reales; solo valida el handshake MCP. Para pruebas integradas reales, usa `npm run test:integration` apuntando a un servidor Reportia accesible.
- **Sin reintentos automáticos:** ante 5xx el servidor reporta error; el LLM puede reintentar manualmente.

## Seguridad

El servidor está diseñado para minimizar superficie de ataque cuando es invocado por un LLM:

- **No hay herramienta HTTP genérica**: las tools son curadas por dominio (66 endpoints específicos). El LLM no puede apuntar el cliente a una URL arbitraria ni a una IP interna.
- **Validación Zod en cada input**: ningún handler llega a la red sin antes pasar por un esquema que rechaza tipos, rangos y formatos inválidos.
- **Tools destructivas requieren `confirm: true` literal**: se declaran con `destructive: true` y verifican con `assertConfirmed(...)` antes de cualquier llamada HTTP. Si falta `confirm`, devuelven `GUARD_REJECTED` **sin tocar la API**. El LLM debe pedirle al usuario confirmación explícita antes de invocarlas.
- **Interpolación segura en URLs**: los IDs numéricos (companyId, mappingId, reportId, runId, uploadId) son validados como `z.number().int().positive()` antes de la interpolación. Los strings de path (NIT, invoiceId, mappingId de líneas/centros) usan `encodeURIComponent` y/o se restringen a un alfabeto seguro (`[A-Za-z0-9-]+` para NITs).
- **Cabeceras HTTP saneadas**: el `User-Agent` configurable vía `REPORTIA_USER_AGENT` se sanitiza contra CRLF (header injection) en `src/client.ts:sanitizeUserAgent`.
- **Sin secretos en logs**: los mensajes de error exponen el endpoint y el código HTTP, pero nunca el token, la cookie, la contraseña ni el cuerpo completo del body. La cookie `connect.sid` se mantiene en memoria del cliente y nunca aparece en respuestas JSON.
- **Login con cookie persistente**: el modo sesión reutiliza la cookie `connect.sid` recibida de `/api/auth/login` y la rota solo si Reportia la renueva; nunca se escribe a disco.
- **Tests de regresión de seguridad** (`tests/security.test.ts`): 16 tests que verifican que ninguna tool destructiva omite `confirm`, que ningún esquema acepta inputs peligrosos, y que el orden de guards (resolveCompanyId → assertConfirmed) prefiere errores informativos sobre GUARD_REJECTED cuando el problema es de configuración.

---

## Rutas cubiertas y omitidas

### Cubiertas (`tools/`)

| Endpoint                                              | Tool                                            |
| ----------------------------------------------------- | ----------------------------------------------- |
| `GET  /api/health`                                    | `reportia_health`                               |
| `GET  /api/auth/me`                                   | `reportia_whoami`                               |
| `POST /api/auth/logout`                               | `reportia_logout`                               |
| `GET  /api/companies`                                 | `reportia_companies_list`                       |
| `GET  /api/companies/:id`                             | `reportia_company_get`                          |
| `GET  /api/companies/:id/settings`                    | `reportia_company_settings_get`                 |
| `PATCH /api/companies/:id/settings`                   | `reportia_company_settings_update`              |
| `POST /api/companies/:id/activate`                    | `reportia_company_activate`                     |
| `GET  /api/accounting-movements` (con filtros)        | `reportia_movements_list`                       |
| `GET  /api/accounting-movements/export/excel`         | `reportia_movements_export_excel`               |
| `GET  /api/accounting-movements/export/pdf`           | `reportia_movements_export_pdf`                 |
| `DELETE /api/accounting-movements`                    | `reportia_movements_delete_all`                 |
| `GET/POST/PATCH/DELETE /api/account-mappings/...`     | `reportia_account_mapping_*`                    |
| `GET /api/account-codes/search`                       | `reportia_account_codes_search`                 |
| `GET /api/commission-reports`                         | `reportia_commission_list`                      |
| `GET /api/commission-reports/export/excel`            | `reportia_commission_export_excel`              |
| `GET /api/third-parties`                              | `reportia_third_parties_list`                   |
| `GET /api/third-parties/search`                       | `reportia_third_parties_search`                 |
| `GET /api/third-parties/by-nit/:nit`                  | `reportia_third_parties_get_by_nit`             |
| `GET /api/third-parties/portfolio-balance`            | `reportia_third_parties_portfolio_balance`      |

### Omitidas (fuera de alcance de esta versión)

- Login por sesión desde una tool (no se necesita: ya se hace lazy desde `ReportiaClient`).
- Cualquier endpoint de subida (`multipart/form-data`) — la superficie se limita a `GET /api/companies/:companyId/upload-history` y `GET /api/upload/:uploadId/status` (read-only).
- Endpoints administrativos internos que requieren scopes no documentados públicamente.
- Versionado antiguo (`/api/v0/*`).

> ⚠️ Esta tabla refleja la superficie **actual** de `src/tools/*.ts`. Antes de añadir rutas nuevas, edita `src/tools/<modulo>.ts`, re-exporta en `src/tools/index.ts` y corre `npm run typecheck && npm test`.

---

## Desarrollo local

Requisitos:

- Node.js ≥ 20
- npm ≥ 9

```bash
# 1) Instalar dependencias
npm install

# 2) Compilar TypeScript a dist/
npm run build

# 3) Verificar tipos sin emitir
npm run typecheck

# 4) Ejecutar el servidor (lee dist/server.js, stdio)
npm run start
```

Los tests **no** requieren Reportia levantada ni credenciales; usan entorno sintético.

---

## Pruebas

```bash
# Suite unitaria (Vitest) — sin red, sin credenciales
npm test

# Smoke de protocolo MCP sobre stdio (sin credenciales reales)
npm run test:smoke

# Smoke de integracion contra un servidor Reportia REAL
# (configura REPORTIA_BASE_URL y REPORTIA_TOKEN en tu entorno antes).
npm run build
REPORTIA_BASE_URL=https://reportia.example.com \
REPORTIA_TOKEN=<tu-token> \
  npm run test:integration
```

El smoke test (`scripts/jsonrpc-smoke.mjs`) lanza `dist/server.js` como subproceso, le envía `initialize` + `tools/list` por JSON-RPC newline-delimited y verifica que la respuesta contenga al menos una herramienta. **No** realiza llamadas HTTP contra Reportia (apunta a `127.0.0.1:9`).

El test de integración (`scripts/integration-smoke.mjs`) sí habla con un servidor Reportia real: hace `initialize`, `tools/list`, llama a `reportia_health` (que hace ping a `/api/health`) y a `reportia_whoami` (que debe devolver `AUTH_ERROR` con un token inválido para validar el manejo de errores). Útil para verificar que la versión desplegada sigue siendo compatible con el backend real.

Si solo quieres validar que la build no está rota:

```bash
npm test -- --passWithNoTests
```

---

## Inspección con MCP Inspector

```bash
npm run inspect
```

Esto ejecuta `npx @modelcontextprotocol/inspector node dist/server.js`, que abre una UI web para enviar manualmente los métodos del protocolo (`initialize`, `tools/list`, `tools/call`, etc.).

---

## Arquitectura interna

```
src/
├── server.ts               # Arranca McpServer + StdioServerTransport y registra tools.
├── config.ts               # Carga y valida env vars (Zod).
├── client.ts               # Cliente HTTP sobre undici. Bearer o sesión cookie.
├── errors.ts               # Jerarquía ReportiaError.
├── tool-base.ts            # Helpers: ToolDefinition, ok/fail, resolveCompanyId, assertConfirmed.
└── tools/
    ├── index.ts            # allTools = union de los modulos.
    ├── auth-health.ts      # reportia_health / whoami / logout.
    ├── companies.ts        # reportia_companies_*.
    ├── accounting-movements.ts  # reportia_movements_*.
    ├── account-mappings.ts # reportia_account_mapping_* y account_codes_search.
    ├── commission-reports.ts # reportia_commission_*.
    └── third-parties.ts    # reportia_third_parties_*.

scripts/
└── jsonrpc-smoke.mjs       # Smoke de protocolo (sin red contra Reportia).

tests/
├── config.test.ts          # loadConfig.
├── resolve-company-id.test.ts # helpers de tool-base.
└── schema-validation.test.ts  # invariantes de allTools y Zod.
```

Convenciones:

- Cada tool **debe** usar un esquema Zod (`z.object({...})`) para validar su input.
- Los handlers **deben** envolver `ctx.client.call(...)` en `try/catch` y usar `ok(...)`/`fail(...)` de `tool-base.ts`.
- Tools mutaciones destructivas **deben** declarar `destructive: true` y verificar `confirm: true` con `assertConfirmed(...)` o equivalente en su handler.

---

## Licencia

[MIT](./LICENSE)

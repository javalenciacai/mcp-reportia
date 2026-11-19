# mcp-reportia 0.3.5 — nota de release

Fecha: 2026-09-11.

## Qué vas a notar

- **Se intentó corregir el rechazo de todas las llamadas a `reportia_movements_list` de 0.3.4**, aceptando los datos internos que el protocolo MCP agrega a cada llamada (`signal`, `sessionId`, `_meta`).

## Lo que NO cambia

- Las demás 65 herramientas y la autenticación.
- La exigencia de al menos un filtro (o `confirmBroadQuery: true`) en `reportia_movements_list`.

## Lo que todavía puede fallar

- **`reportia_movements_list` seguía sin poder usarse.** La corrección de esta versión no bastó: el asistente seguía sin recibir los parámetros de la herramienta y toda llamada se rechazaba con `INVALID_INPUT`. Se corrigió en la versión 0.3.6.
- **Los filtros y la paginación no llegaban a Reportia.** Cuando le pedías al asistente un listado, una búsqueda o una exportación con filtros (fechas, NIT, número de documento, límite, página), esos datos no se enviaban: Reportia respondía como si no hubiera filtros. Se corrigió en la versión 0.3.7.
- Esta versión, como todas las publicadas hasta hoy, ofrece también herramientas que **cambian o borran datos** en Reportia (por ejemplo, borrar todos los movimientos de una empresa) y **no tiene modo de solo lectura**. Quien conecta un asistente al paquete debe tenerlo en cuenta.

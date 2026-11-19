# mcp-reportia 0.3.6 — nota de release

Fecha: 2026-09-11.

## Qué vas a notar

- **`reportia_movements_list` vuelve a funcionar.** El asistente recibe de nuevo la lista de parámetros de la herramienta (incluidos `dateFrom`, `dateTo`, `limit`, `offset` y `confirmBroadQuery`) y las llamadas con filtros se aceptan.
- Se mantiene la exigencia de al menos un filtro, salvo `confirmBroadQuery: true`.

## Lo que NO cambia

- Las otras 65 herramientas y la autenticación.

## Lo que todavía puede fallar

- **Los filtros y la paginación no llegaban a Reportia.** Cuando le pedías al asistente un listado, una búsqueda o una exportación con filtros (fechas, NIT, número de documento, límite, página), esos datos no se enviaban: Reportia respondía como si no hubiera filtros. Se corrigió en la versión 0.3.7. La última pieza de ese fallo se corrigió en 0.3.7; con esta versión la herramienta acepta los filtros pero Reportia no los recibe.
- Esta versión, como todas las publicadas hasta hoy, ofrece también herramientas que **cambian o borran datos** en Reportia (por ejemplo, borrar todos los movimientos de una empresa) y **no tiene modo de solo lectura**. Quien conecta un asistente al paquete debe tenerlo en cuenta.

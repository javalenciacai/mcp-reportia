# mcp-reportia 0.2.1 — nota de release

Fecha: 2026-09-07.

## Qué vas a notar

- **`reportia_movements_list` acepta un parámetro `limit`** (de 1 a 1000; si no lo indicas, 100) para no pedir de una sola vez todos los movimientos de un rango amplio. Solo aplica a ese listado: las demás herramientas de listado (por ejemplo, `reportia_companies_list`) no ganaron ese parámetro.

## Lo que NO cambia

- Las 66 herramientas, la autenticación y el resto de los filtros de movimientos (fechas, NIT, número de documento, tipo de comprobante, estado del correo).

## Lo que todavía puede fallar

- **El `limit` nuevo no llegaba a Reportia**, igual que el resto de los filtros: la consulta de movimientos seguía sin límite. Se corrigió en la versión 0.3.7.
- **Los filtros y la paginación no llegaban a Reportia.** Cuando le pedías al asistente un listado, una búsqueda o una exportación con filtros (fechas, NIT, número de documento, límite, página), esos datos no se enviaban: Reportia respondía como si no hubiera filtros. Se corrigió en la versión 0.3.7.
- Esta versión, como todas las publicadas hasta hoy, ofrece también herramientas que **cambian o borran datos** en Reportia (por ejemplo, borrar todos los movimientos de una empresa) y **no tiene modo de solo lectura**. Quien conecta un asistente al paquete debe tenerlo en cuenta.

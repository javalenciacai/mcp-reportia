# mcp-reportia 0.3.7 — nota de release

Fecha: 2026-09-12.

## Qué vas a notar

- **Los filtros y la paginación ya llegan a Reportia.** Lo que le pides al asistente en listados, búsquedas y exportaciones (fechas, NIT, número de documento, tipo de comprobante, límite, página) ahora se envía completo, incluso en una consulta amplia sin filtros de fila: si pides `limit: 2` y `offset: 20`, recibes 2 movimientos a partir del 21, no los primeros 100. Si no indicas `limit` ni `offset`, Reportia recibe de todas formas los valores por defecto (100 y 0). Por ejemplo, `reportia_movements_list` con un rango de dos días devuelve solo los movimientos de esos días, no toda la tabla.

## Lo que NO cambia

- Las 66 herramientas y la autenticación.
- Las llamadas sin filtros siguen devolviendo todos los movimientos que cumplan la consulta, **salvo la paginación**: si indicas `limit` u `offset`, ahora se respetan también en una consulta amplia (antes se ignoraban).

## Lo que todavía puede fallar

- Si usaste versiones anteriores, **revisa los resultados que obtuviste con filtros**: antes de esta versión los filtros no llegaban a Reportia.
- Esta versión, como todas las publicadas hasta hoy, ofrece también herramientas que **cambian o borran datos** en Reportia (por ejemplo, borrar todos los movimientos de una empresa) y **no tiene modo de solo lectura**. Quien conecta un asistente al paquete debe tenerlo en cuenta.

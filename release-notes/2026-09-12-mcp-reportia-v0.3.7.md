# mcp-reportia 0.3.7 — nota de release

Fecha: 2026-09-12.

## Qué vas a notar

- **Los filtros y la paginación ya llegan a Reportia.** Lo que le pides al asistente en listados, búsquedas y exportaciones (fechas, NIT, número de documento, tipo de comprobante, límite, página) ahora se envía completo. Por ejemplo, `reportia_movements_list` con un rango de dos días devuelve solo los movimientos de esos días, no toda la tabla.

## Lo que NO cambia

- Las 66 herramientas y la autenticación.
- Las llamadas sin filtros devuelven lo mismo que antes.

## Lo que todavía puede fallar

- Si usaste versiones anteriores, **revisa los resultados que obtuviste con filtros**: antes de esta versión los filtros no llegaban a Reportia.
- Esta versión, como todas las publicadas hasta hoy, ofrece también herramientas que **cambian o borran datos** en Reportia (por ejemplo, borrar todos los movimientos de una empresa) y **no tiene modo de solo lectura**. Quien conecta un asistente al paquete debe tenerlo en cuenta.

# mcp-reportia 0.3.7 — nota de release

Fecha: 2026-09-12.

## Qué vas a notar

- **Los filtros y la paginación ya llegan a Reportia en listados y búsquedas.** Lo que le pides al asistente (fechas, NIT, número de documento, tipo de comprobante, estado del correo, límite y desplazamiento `offset`) ahora se envía completo, incluso en una consulta amplia sin filtros de fila: si pides `limit: 2` y `offset: 20`, recibes 2 movimientos a partir del 21, no los primeros 100. Si no indicas `limit` ni `offset`, Reportia recibe de todas formas los valores por defecto (100 y 0). Por ejemplo, `reportia_movements_list` con un rango de dos días devuelve solo los movimientos de esos días, no toda la tabla.
- **Una consulta sin filtros devuelve como máximo `limit` movimientos** (100 si no lo indicas), no todos: pide los siguientes con `offset`.
- **Las exportaciones de movimientos a Excel y PDF ahora reciben las fechas** (`startDate`, `endDate`), el NIT, el número de documento e `includePreviousBalance`. Las exportaciones no tienen `limit` ni `offset`.

## Lo que NO cambia

- Las 66 herramientas y la autenticación.
- Una llamada sin filtros sigue necesitando `confirmBroadQuery: true`, igual que en 0.3.6.

## Lo que todavía puede fallar

- Si usaste versiones anteriores, **revisa los resultados que obtuviste con filtros**: antes de esta versión los filtros no llegaban a Reportia.
- **El tipo de comprobante todavía no llega a Reportia en las exportaciones** a Excel y PDF: `reportia_movements_export_excel` y `reportia_movements_export_pdf` lo aceptan, pero no lo envían, así que el archivo sale sin ese filtro.
- **Los nombres antiguos de las fechas se siguen perdiendo sin aviso.** Si todavía envías `startDate` o `endDate` a `reportia_movements_list` junto con otro filtro (por ejemplo, el NIT), se descartan sin error y la consulta sale sin filtro de fechas: usa `dateFrom` y `dateTo`. Las exportaciones sí usan `startDate` y `endDate`.
- Esta versión, como todas las publicadas hasta hoy, ofrece también herramientas que **cambian o borran datos** en Reportia (por ejemplo, borrar todos los movimientos de una empresa) y **no tiene modo de solo lectura**. Quien conecta un asistente al paquete debe tenerlo en cuenta.

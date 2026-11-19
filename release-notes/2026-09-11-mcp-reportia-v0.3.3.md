# mcp-reportia 0.3.3 — nota de release

Fecha: 2026-09-11.

## Qué vas a notar

- **`reportia_movements_list` avisa cuando se pide sin ningún filtro.** Si la llamada no trae fechas, NIT, número de documento, tipo de comprobante ni estado del correo, la respuesta incluye una advertencia `NO_FILTER`, porque devuelve toda la tabla de movimientos de la empresa. Si hay algún filtro, no hay advertencia.

## Lo que NO cambia

- Las 66 herramientas y la autenticación.
- La llamada sin filtros sigue funcionando; solo trae el aviso.

## Lo que todavía puede fallar

- **El aviso podía ser engañoso:** como los filtros no llegaban a Reportia, una llamada con fechas devolvía igual toda la tabla, aunque no trajera el aviso.
- **Los filtros y la paginación no llegaban a Reportia.** Cuando le pedías al asistente un listado, una búsqueda o una exportación con filtros (fechas, NIT, número de documento, límite, página), esos datos no se enviaban: Reportia respondía como si no hubiera filtros. Se corrigió en la versión 0.3.7.
- Esta versión, como todas las publicadas hasta hoy, ofrece también herramientas que **cambian o borran datos** en Reportia (por ejemplo, borrar todos los movimientos de una empresa) y **no tiene modo de solo lectura**. Quien conecta un asistente al paquete debe tenerlo en cuenta.

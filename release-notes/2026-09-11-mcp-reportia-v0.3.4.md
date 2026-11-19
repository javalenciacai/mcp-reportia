# mcp-reportia 0.3.4 — nota de release

Fecha: 2026-09-11.

## Qué vas a notar

- **Se pretendía que `reportia_movements_list` rechazara las llamadas sin filtro.** Debía exigir al menos uno entre `dateFrom`, `dateTo`, `nit`, `numeroDocumento`, `tipoComprobante` o `emailStatus`, salvo que se indicara `confirmBroadQuery: true` para pedir adrede toda la tabla.

## Lo que NO cambia

- Las demás 65 herramientas y la autenticación.

## Lo que todavía puede fallar

- **En la práctica, `reportia_movements_list` no se podía usar en esta versión.** El asistente no recibía la descripción de los parámetros y toda llamada se rechazaba con `INVALID_INPUT`, incluso con filtros correctos. Se corrigió en la versión 0.3.6; si usas esta herramienta, no uses 0.3.4 ni 0.3.5.
- `reportia_movements_export_excel` y `reportia_movements_export_pdf` dependen de otra consulta y no se vieron afectadas por este fallo.
- **Los filtros y la paginación no llegaban a Reportia.** Cuando le pedías al asistente un listado, una búsqueda o una exportación con filtros (fechas, NIT, número de documento, límite, página), esos datos no se enviaban: Reportia respondía como si no hubiera filtros. Se corrigió en la versión 0.3.7.
- Esta versión, como todas las publicadas hasta hoy, ofrece también herramientas que **cambian o borran datos** en Reportia (por ejemplo, borrar todos los movimientos de una empresa) y **no tiene modo de solo lectura**. Quien conecta un asistente al paquete debe tenerlo en cuenta.

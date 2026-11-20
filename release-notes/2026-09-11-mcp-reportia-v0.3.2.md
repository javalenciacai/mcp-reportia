# mcp-reportia 0.3.2 — nota de release

Fecha: 2026-09-11.

## Qué vas a notar

- **`reportia_movements_list` repite los filtros con los que se pidió.** La respuesta ahora es `{ query, movements, total, limit, offset }`, y `query` muestra los filtros que el paquete recibió, para comparar lo pedido con lo devuelto.
- La descripción de la herramienta recomienda `reportia_movements_export_excel` cuando se esperan más de unas 5000 filas.
- **Los archivos exportados se guardan por defecto en la carpeta temporal del sistema** (`mcp-reportia` dentro de ella), no en `downloads` dentro de la carpeta de trabajo. Esto evita el error de permisos en contenedores con la carpeta de trabajo de solo lectura. Para fijar otra carpeta, usa `REPORTIA_DOWNLOAD_DIR`.

## Lo que NO cambia

- Las 66 herramientas y la autenticación.
- Si ya fijas `REPORTIA_DOWNLOAD_DIR`, tus exportaciones van donde siempre.

## Lo que todavía puede fallar

- **Lo que muestra `query` es lo que se pidió, no lo que llegó a Reportia.** Por el fallo siguiente, la respuesta podía mostrar filtros de fechas que Reportia nunca recibió.
- **Los filtros y la paginación no llegaban a Reportia.** Cuando le pedías al asistente un listado, una búsqueda o una exportación con filtros (fechas, NIT, número de documento, límite, desplazamiento `offset`), esos datos no se enviaban: Reportia respondía como si no hubiera filtros. Se corrigió en la versión 0.3.7.
- **Los nombres antiguos de las fechas se siguen perdiendo sin aviso.** Si todavía envías `startDate` o `endDate` a `reportia_movements_list` junto con otro filtro (por ejemplo, el NIT), se descartan sin error y la consulta sale sin filtro de fechas: usa `dateFrom` y `dateTo`. Las exportaciones sí usan `startDate` y `endDate`.
- Esta versión, como todas las publicadas hasta hoy, ofrece también herramientas que **cambian o borran datos** en Reportia (por ejemplo, borrar todos los movimientos de una empresa) y **no tiene modo de solo lectura**. Quien conecta un asistente al paquete debe tenerlo en cuenta.

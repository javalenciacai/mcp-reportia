# mcp-reportia 0.3.0 — nota de release

Fecha: 2026-09-07.

## Qué vas a notar

- **`reportia_movements_list` ahora devuelve los movimientos como filas simples**, sin los totales y agregados que usa la pantalla de reportes. Es una respuesta más liviana, pensada para que la lea un asistente.
- **Tiene paginación**: acepta `offset` (por defecto 0) además de `limit`, y la respuesta trae `total`, `limit` y `offset` para pedir la página siguiente.

## Lo que NO cambia

- Las 66 herramientas y la autenticación.
- Los nombres de los filtros de fecha siguen siendo `startDate` y `endDate` (cambian en 0.3.1).
- Las exportaciones a Excel y PDF siguen funcionando igual, aunque entre sus parámetros aparecen `limit` y `offset`, que no hacen nada en ellas.

## Lo que todavía puede fallar

- Esta consulta depende de que la instalación de Reportia a la que te conectas ya tenga el listado de movimientos en filas; si no lo tiene, la herramienta devuelve un error.
- **Los filtros y la paginación no llegaban a Reportia.** Cuando le pedías al asistente un listado, una búsqueda o una exportación con filtros (fechas, NIT, número de documento, límite, desplazamiento `offset`), esos datos no se enviaban: Reportia respondía como si no hubiera filtros. Se corrigió en la versión 0.3.7. En esta versión eso incluye `offset` y las fechas de `reportia_movements_list`: siempre se obtenía la primera página sin filtrar.
- Esta versión, como todas las publicadas hasta hoy, ofrece también herramientas que **cambian o borran datos** en Reportia (por ejemplo, borrar todos los movimientos de una empresa) y **no tiene modo de solo lectura**. Quien conecta un asistente al paquete debe tenerlo en cuenta.

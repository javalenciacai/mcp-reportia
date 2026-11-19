# mcp-reportia 0.3.1 — nota de release

Fecha: 2026-09-10.

## Qué vas a notar

- **Cambio que rompe compatibilidad en `reportia_movements_list`:** las fechas pasan a llamarse `dateFrom` y `dateTo` (antes `startDate` y `endDate`), igual que en Reportia. Quien siga enviando los nombres antiguos recibe un error de validación. Para migrar, reemplaza los nombres en cada llamada.
- `reportia_movements_list` ahora rechaza parámetros que no conoce, en lugar de ignorarlos en silencio.

## Lo que NO cambia

- `reportia_movements_export_excel` y `reportia_movements_export_pdf` **siguen usando `startDate` y `endDate`**.
- Las demás herramientas, la autenticación y la paginación.

## Lo que todavía puede fallar

- **Los filtros y la paginación no llegaban a Reportia.** Cuando le pedías al asistente un listado, una búsqueda o una exportación con filtros (fechas, NIT, número de documento, límite, página), esos datos no se enviaban: Reportia respondía como si no hubiera filtros. Se corrigió en la versión 0.3.7. En esta versión, aunque uses los nombres nuevos, las fechas de `reportia_movements_list` no llegaban.
- Esta versión, como todas las publicadas hasta hoy, ofrece también herramientas que **cambian o borran datos** en Reportia (por ejemplo, borrar todos los movimientos de una empresa) y **no tiene modo de solo lectura**. Quien conecta un asistente al paquete debe tenerlo en cuenta.

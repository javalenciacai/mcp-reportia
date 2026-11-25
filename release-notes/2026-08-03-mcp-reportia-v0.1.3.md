# mcp-reportia 0.1.3 — nota de release

Fecha: 2026-08-03. Es la primera versión que lleva tag en el repositorio; esta nota describe lo que el paquete ofrecía en ese punto.

## Qué vas a notar

- El paquete es un servidor MCP que se conecta a Reportia y ofrece **66 herramientas** a un asistente: consultar movimientos contables, terceros y cartera, empresas, comisiones, facturas, mapeos de cuentas, de vendedores, de grupos de línea y de centros de costo, reportes de centro de costo, cargas y salud del sistema, y exportar movimientos y reportes a Excel o PDF.
- Se autentica con un token (`REPORTIA_TOKEN`) o con correo y contraseña (`REPORTIA_EMAIL` y `REPORTIA_PASSWORD`).

## Lo que NO cambia

No hay versión anterior con tag con la cual comparar.

## Lo que todavía puede fallar

- **Las herramientas cuya respuesta es una lista fallaban.** Por ejemplo, `reportia_companies_list` devolvía un error de protocolo (`-32602`) en lugar de la lista de empresas. Se corrigió en la versión 0.1.6.
- **Los filtros y el límite no llegaban a Reportia.** Cuando le pedías al asistente un listado, una búsqueda o una exportación con filtros (fechas, NIT, número de documento, límite), esos datos no se enviaban: Reportia respondía como si no hubiera filtros. Se corrigió en la versión 0.3.7.
- En rangos de fechas amplios, `reportia_movements_list` no tenía parámetro de límite y la respuesta podía ser rechazada por tamaño. Versiones posteriores agregaron límite y paginación (ver 0.2.1 y 0.3.0).
- Esta versión, como todas las publicadas hasta hoy, ofrece también herramientas que **cambian o borran datos** en Reportia (por ejemplo, borrar todos los movimientos de una empresa) y **no tiene modo de solo lectura**. Quien conecta un asistente al paquete debe tenerlo en cuenta.

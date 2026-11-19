# mcp-reportia 0.1.6 — nota de release

Fecha: 2026-09-03.

## Qué vas a notar

- **Las herramientas cuya respuesta es una lista ya funcionan.** Por ejemplo, `reportia_companies_list` ahora devuelve la lista de empresas en lugar de un error de protocolo.

## Lo que NO cambia

- Las 66 herramientas y la forma de autenticarse (token, o correo y contraseña).
- Las herramientas cuya respuesta no es una lista se comportan igual que antes.

## Lo que todavía puede fallar

- **Los filtros y el límite no llegaban a Reportia.** Cuando le pedías al asistente un listado, una búsqueda o una exportación con filtros (fechas, NIT, número de documento, límite), esos datos no se enviaban: Reportia respondía como si no hubiera filtros. Se corrigió en la versión 0.3.7.
- Esta versión, como todas las publicadas hasta hoy, ofrece también herramientas que **cambian o borran datos** en Reportia (por ejemplo, borrar todos los movimientos de una empresa) y **no tiene modo de solo lectura**. Quien conecta un asistente al paquete debe tenerlo en cuenta.

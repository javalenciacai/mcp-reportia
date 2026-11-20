# mcp-reportia 0.2.0 — nota de release

Fecha: 2026-09-04.

## Qué vas a notar

- **Hay una tercera forma de autenticarse: una sesión ya iniciada.** Si quien integra el paquete ya tiene la cookie de sesión de la persona en Reportia, puede pasarla en `REPORTIA_COOKIE`. El paquete la usa tal cual: **no inicia sesión** al arrancar y **no la cierra** al terminar, porque la sesión no es suya. Ojo: si el asistente usa la herramienta `reportia_logout`, esa sí cierra la sesión prestada.
- Si configuras cookie y correo con contraseña, gana la cookie; si configuras token y correo con contraseña, gana el token. Cookie y token a la vez no se aceptan (ver más abajo).

## Lo que NO cambia

- Las 66 herramientas.
- Quien usa `REPORTIA_TOKEN`, o `REPORTIA_EMAIL` con `REPORTIA_PASSWORD`, no nota ninguna diferencia.

## Lo que todavía puede fallar

- No se puede configurar `REPORTIA_TOKEN` y `REPORTIA_COOKIE` a la vez: el paquete no arranca y avisa que son excluyentes. Usa solo una.
- **Los filtros y el límite no llegaban a Reportia.** Cuando le pedías al asistente un listado, una búsqueda o una exportación con filtros (fechas, NIT, número de documento, límite), esos datos no se enviaban: Reportia respondía como si no hubiera filtros. Se corrigió en la versión 0.3.7.
- Esta versión, como todas las publicadas hasta hoy, ofrece también herramientas que **cambian o borran datos** en Reportia (por ejemplo, borrar todos los movimientos de una empresa) y **no tiene modo de solo lectura**. Quien conecta un asistente al paquete debe tenerlo en cuenta.

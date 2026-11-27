# mcp-reportia 0.5.1 — nota de release

## Qué vas a notar

- **El servidor ahora anuncia su versión real** (por ejemplo, al conectarse desde tu cliente MCP) en vez de mostrar siempre `0.1.0`, que era el número de la primera versión publicada.
- **La respuesta del estado de resultados puede traer el nombre que tu empresa le puso a una cuenta, si tu Reportia ya incluye el mapeo de nombres de cuenta y la mapeaste**; si no la mapeaste, o tu Reportia todavía no lo tiene, sigue viniendo solo el código. Esto corrige una afirmación desactualizada de la documentación (decía que ese nombre nunca llegaba).
- **Se corrige la ficha que esta versión intenta publicar en el registro público de servidores MCP**: la versión anterior se rechazaba por tener una descripción demasiado larga.

## Lo que NO cambia

- Ninguna herramienta cambia su comportamiento: mismas consultas, filtros, exportaciones y resultados que en la versión anterior.
- El estado de resultados sigue sin recalcular ni redondear ninguna cifra, y sigue trayendo únicamente la utilidad bruta (no hay utilidad operacional ni neta).
- Para el chat de producción no cambia nada: ni la lista de herramientas (67, o 38 con el perfil de solo lectura) ni los riesgos ya declarados en la versión anterior.

## Lo que todavía puede fallar

- **Una línea o cuenta cuyo código lleva letras (por ejemplo `52A`) sigue sin poder pedirse su desglose con ese código, y esta versión no lo corrige** (una nota anterior decía que llegaría en esta versión; no es así). Esos códigos aparecen aparte, en «no clasificadas», y no suman a ninguna clase ni a la utilidad bruta — el sistema los separa en vez de mostrar una cifra que los mezcle con cuentas válidas.
- **Las cifras pueden tener hasta 5 minutos de antigüedad** y una respuesta de más de 2 MiB se sigue rechazando en vez de entregarse a medias; esto no cambió.
- **Si Reportia devuelve datos incompletos en un movimiento** (por ejemplo, sin documento, o un identificador de tercero nulo o ausente — no «sin tercero», que viene como cadena vacía y sí se muestra), la herramienta sigue respondiendo con un error de contrato en vez de mostrar cifras, aunque los totales sean correctos.
- Los riesgos ya conocidos del perfil de solo lectura y de las herramientas que cambian datos, declarados en la nota de la versión anterior, siguen vigentes sin cambios.

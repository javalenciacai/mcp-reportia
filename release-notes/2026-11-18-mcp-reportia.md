# mcp-reportia 0.4.0 — nota de release (borrador, aún sin publicar)

> Estado: **pendiente de publicación**. La publicación de 0.4.0 y su tag son un paso posterior, con su propia aprobación. La convención completa de esta carpeta (`release-notes/README.md`) la aporta MCPR-4.

## Qué vas a notar

- **El asistente conversacional que consulta Reportia ya no puede escribir ni borrar.** Cuando la integración activa el modo de solo lectura, solo puede consultar: ver movimientos, terceros, cartera, reportes y exportar a Excel o PDF. No puede crear, cambiar ni borrar nada (por ejemplo, borrar todos los movimientos de una empresa), ni enviar facturas por correo.
- **Tampoco puede leer las claves guardadas** de correo de facturación ni la contraseña de SIIGO: esas consultas quedan fuera del modo de solo lectura.
- **En ese modo, el asistente solo trabaja con la empresa que se le asignó.** Si pide datos de otra empresa, la consulta se rechaza.
- El paquete publica la lista oficial de herramientas de consulta (`read-only-tools.json`) para que quien lo integre la use como lista permitida.

## Lo que NO cambia

- Si no se activa el modo de solo lectura, todo funciona exactamente igual que en 0.3.7 (las 66 herramientas).
- Las consultas, filtros y exportaciones permitidas dan los mismos resultados que antes.

## Lo que todavía puede fallar

- El modo de solo lectura se activa por configuración del despliegue. Si la integración no lo activa (o no limita la lista de herramientas), el asistente sigue viendo todas. Quien integra debe verificarlo al arrancar.
- Las exportaciones a Excel y PDF guardan archivos en el servidor donde corre el paquete; no escriben en Reportia.

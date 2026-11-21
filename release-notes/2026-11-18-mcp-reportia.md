# mcp-reportia 0.5.0 — nota de release

> Fecha de publicación prevista: **2026-11-20**. Esta versión incluye también el perfil de solo lectura, que estaba previsto para una 0.4.0 que no se publica por separado.

## Qué vas a notar

- **Hay una herramienta nueva: el estado de resultados con el origen de cada cifra** (`reportia_income_statement_get`). Pides un periodo y recibes ingresos, costos y gastos con la utilidad bruta; cada total dice de dónde sale y trae una muestra de los movimientos que lo componen (5 por cuenta, por defecto).
- **Puedes pedir el resto de los movimientos de una línea.** Indicando la cuenta (o el prefijo de la línea) recibes el desglose por páginas, con la suma exacta de la línea, para las cuentas cuyo código es numérico (de 1 a 10 dígitos).
- **Lo que no cabe se avisa, no se esconde.** Si el resumen trae menos movimientos de muestra de los que existen, la herramienta dice cuántos faltan y por qué importe. Las páginas del desglose traen el total de la línea y los datos de paginación para seguir pidiendo las siguientes. Si una respuesta es demasiado grande, responde con un error claro en lugar de entregar datos a medias.
- **Las cuentas que no son ingresos, costos ni gastos se muestran aparte** (como «no clasificadas») y no entran en la utilidad bruta. También se informa lo que se dejó fuera de los totales: comprobantes anulados, importes o sentidos inválidos y movimientos sin fecha.
- **Los importes llegan como texto exacto**, sin redondeos (por ejemplo `12000000.625`).
- **Hay un perfil opcional de solo lectura, apagado por defecto.** Quien integre el paquete puede activarlo (`REPORTIA_READ_ONLY=true`) para que el servidor ofrezca solo las herramientas de consulta (ahora 38, incluida la nueva): ver movimientos, terceros, cartera, reportes y exportar a Excel o PDF.
- **Ese perfil deja fuera tres lecturas de configuración sensibles.** Quien lo active no las tiene disponibles.
- **Con el perfil activo y la empresa fijada en `REPORTIA_COMPANY_ID`**, **no se puede pedir datos de otra empresa** (la consulta se rechaza). La lista de empresas disponibles sigue mostrando todas las que el usuario puede ver.
- El paquete publica la lista oficial de herramientas de consulta (`read-only-tools.json`) para que quien lo integre la use como lista permitida.
- **Se recomienda actualizar a esta versión.** Incluye la actualización de las librerías de las que depende el paquete por avisos de seguridad.
- **Versiones mínimas declaradas:** esta versión exige como mínimo `undici` `^6.29.1` y fija el SDK de MCP exactamente en `1.32.2`. Quien ya tenía el paquete instalado con una versión anterior de `undici` la actualizará en su próxima instalación.
- **Este paquete no trae el archivo de versiones fijas de las dependencias (`package-lock.json`):** quien lo instala recibe las versiones que permitan los rangos declarados, salvo las que están fijadas exactamente (como el SDK de MCP).
- **Al publicar esta versión se intentará actualizar la ficha del registro público de servidores MCP.** La actualización no está garantizada: puede fallar sin que falle la publicación del paquete. Hasta confirmarlo, el registro puede seguir mostrando una versión anterior.

## Lo que NO cambia

- Las 66 herramientas que ya existían funcionan igual que en 0.3.7: mismas consultas, filtros y exportaciones, mismos resultados.
- Si no se activa el modo de solo lectura, el servidor ofrece todas las herramientas: las 66 de siempre más la nueva (67 en total).
- **Para el chat de producción no cambia nada con el perfil de solo lectura**: no lo usa. Lo único nuevo que verá, al actualizar a 0.5.0, es la herramienta de estado de resultados.
- La herramienta nueva solo consulta: no cambia ni borra datos, y no renueva la sesión por su cuenta.
- La herramienta no recalcula ni corrige cifras: entrega lo que informa Reportia.
- La aclaración del contrato con Reportia ya está acordada; las comprobaciones adicionales sobre el desglose de grupos y la documentación de la herramienta que la acompañan llegarán en una versión posterior (0.5.1).
- No hay utilidad operacional ni utilidad neta: solo la utilidad bruta (ingresos menos costos).

## Lo que todavía puede fallar

- **La herramienta de estado de resultados falla mientras el servidor de Reportia en producción no publique el estado de resultados.** Con una versión anterior de Reportia responde con un error; el resto de las herramientas no se ve afectado.
- **Las cifras pueden tener hasta 5 minutos de antigüedad.** Reportia guarda los resultados en memoria: si se cargaron datos hace poco, dos consultas seguidas pueden dar cifras distintas. No las presentes como «en vivo».
- **Hay un aviso de seguridad pendiente en una librería de validación que usa el paquete (`zod` 3.x).** No se ha podido determinar si afecta a esta herramienta: el aviso describe un caso de consumo de memoria al validar colecciones muy grandes y no existe una versión 3.x corregida. Corregirlo exige un salto de versión mayor de esa librería, que se hará en una versión posterior; si ese salto cambia algo para quien integra el paquete, se avisará en su nota.
- **Normalmente las cuentas vienen solo con su código**, pero algunos movimientos pueden traer un nombre de cuenta si Reportia lo entrega. El nombre del tercero puede faltar si su NIT no está registrado.
- **Una línea o cuenta cuyo código lleva letras (por ejemplo `52A`) aparece en el resumen, pero la herramienta no deja pedir su desglose con ese código.** Se corrige en la versión 0.5.1.
- **Las cuentas cuyo código no empieza por 4, 5 o 6** (por ejemplo, la clase 7) aparecen como «no clasificadas» y no suman a ningún total.
- **Cada respuesta trae como máximo 500 movimientos de muestra.** El resto se pide cuenta por cuenta con el desglose. Una respuesta de más de 2 MiB se rechaza (`OUTPUT_TOO_LARGE`): baja el número de movimientos por cuenta o pide el desglose de una línea.
- **El tope de 2 MiB se mide sobre el texto de la respuesta; en la conexión puede ocupar hasta casi el triple (≈3 veces) según el contenido**, porque el protocolo la envía dos veces, en texto y de forma estructurada, y escapa algunos caracteres. Si integras el paquete, dimensiona tu límite de transmisión con ese margen.
- **Si Reportia devuelve datos incompletos en los terceros o en los documentos de un movimiento** (por ejemplo, sin número de identificación o sin tipo o código de documento), la herramienta responde con un error de contrato en vez de mostrar cifras, aunque los totales sean correctos.
- **Si la sesión de Reportia vence**, la herramienta responde con error de autenticación y no la renueva. Si Reportia limita las peticiones (100 por minuto), responde `RATE_LIMITED` y no reintenta.
- **Si Reportia cambia la forma de su respuesta de manera incompatible**, la herramienta responde `UPSTREAM_CONTRACT_MISMATCH` en lugar de entregar datos que podrían interpretarse mal.
- El perfil no limita nada por sí solo: solo actúa en quien lo active. El chat de producción **no lo usa** y conserva todas las herramientas. Por eso siguen vigentes estos riesgos, declarados por el dueño del producto:
  - **En las 15 herramientas que piden confirmación antes de cambiar, borrar o sincronizar datos, la confirmación la completa el asistente, no una persona en pantalla.**
  - **El chat puede cerrar la sesión de Reportia con la que trabaja, sin pedirte confirmación** (herramienta `reportia_logout`).
  - **El chat puede crear o cambiar datos sin pedir confirmación** en 10 casos: crear o actualizar mapeos de cuentas, de vendedores, de grupos de línea y de centros de costo, y reportes de centro de costo.
  - **El chat puede enviar facturas por correo.**
  - **El chat puede borrar todos los movimientos de una empresa** (herramienta `reportia_movements_delete_all`). Es el caso más grave: exige reconocer el riesgo y escribir un texto con el número de la empresa.
- **El asistente puede consultar la configuración de tu empresa, que incluye datos sensibles.** Trátalo como a una persona con acceso completo a tu cuenta y no compartas esas conversaciones.
- Conviene revisar con cuidado lo que se le pide al asistente: puede ejecutar acciones que cambian datos y cerrar la sesión sin una confirmación adicional.
- Las exportaciones a Excel y PDF guardan archivos en el servidor donde corre el paquete; no escriben en Reportia.

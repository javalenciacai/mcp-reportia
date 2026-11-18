# mcp-reportia 0.4.0 — nota de release (borrador, aún sin publicar)

> Estado: **pendiente de publicación**. La publicación de 0.4.0 y su tag son un paso posterior, con su propia aprobación.

## Qué vas a notar

- **Hay un perfil opcional de solo lectura, apagado por defecto.** Quien integre el paquete puede activarlo (`REPORTIA_READ_ONLY=true`) para que el servidor ofrezca solo las herramientas de consulta: ver movimientos, terceros, cartera, reportes y exportar a Excel o PDF.
- **Ese perfil deja fuera tres lecturas de configuración sensibles.** Quien lo active no las tiene disponibles.
- **Con el perfil activo y la empresa fijada en `REPORTIA_COMPANY_ID`**, **no se puede pedir datos de otra empresa** (la consulta se rechaza). La lista de empresas disponibles sigue mostrando todas las que el usuario puede ver.
- El paquete publica la lista oficial de herramientas de consulta (`read-only-tools.json`) para que quien lo integre la use como lista permitida.

## Lo que NO cambia

- Si no se activa el modo de solo lectura, todo funciona exactamente igual que en 0.3.7 (las 66 herramientas).
- **Para el chat de producción no cambia nada.**
- Las consultas, filtros y exportaciones permitidas dan los mismos resultados que antes.

## Lo que todavía puede fallar

- El perfil no limita nada por sí solo: solo actúa en quien lo active. El chat de producción **no lo usa** y conserva las 66 herramientas. Por eso siguen vigentes estos riesgos, declarados por el dueño del producto:
  - **En las 15 herramientas que piden confirmación antes de cambiar, borrar o sincronizar datos, la confirmación la completa el asistente, no una persona en pantalla.**
  - **El chat puede cerrar la sesión de Reportia con la que trabaja, sin pedirte confirmación** (herramienta `reportia_logout`).
  - **El chat puede crear o cambiar datos sin pedir confirmación** en 10 casos: crear o actualizar mapeos de cuentas, de vendedores, de grupos de línea y de centros de costo, y reportes de centro de costo.
  - **El chat puede enviar facturas por correo.**
  - **El chat puede borrar todos los movimientos de una empresa** (herramienta `reportia_movements_delete_all`). Es el caso más grave: exige reconocer el riesgo y escribir un texto con el número de la empresa.
- **El asistente puede consultar la configuración de tu empresa, que incluye datos sensibles.** Trátalo como a una persona con acceso completo a tu cuenta y no compartas esas conversaciones.
- Conviene revisar con cuidado lo que se le pide al asistente: puede ejecutar acciones que cambian datos y cerrar la sesión sin una confirmación adicional.
- Las exportaciones a Excel y PDF guardan archivos en el servidor donde corre el paquete; no escriben en Reportia.

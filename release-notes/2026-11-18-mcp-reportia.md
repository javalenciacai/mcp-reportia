# mcp-reportia 0.4.0 — nota de release (borrador, aún sin publicar)

> Estado: **pendiente de publicación**. La publicación de 0.4.0 y su tag son un paso posterior, con su propia aprobación. La convención completa de esta carpeta (`release-notes/README.md`) la aporta MCPR-4.

## Qué vas a notar

- **Hay un perfil opcional de solo lectura, apagado por defecto.** Quien integre el paquete puede activarlo (`REPORTIA_READ_ONLY=true`) para que el servidor ofrezca solo las herramientas de consulta: ver movimientos, terceros, cartera, reportes y exportar a Excel o PDF.
- **Ese perfil deja fuera tres consultas que devuelven claves en claro** (correo de facturación y contraseña de SIIGO). Quien lo active no las tiene disponibles.
- **Con el perfil activo y la empresa fijada en `REPORTIA_COMPANY_ID`**, el servidor trabaja solo con esa empresa: si se pide otra, la consulta se rechaza.
- El paquete publica la lista oficial de herramientas de consulta (`read-only-tools.json`) para que quien lo integre la use como lista permitida.

## Lo que NO cambia

- Si no se activa el modo de solo lectura, todo funciona exactamente igual que en 0.3.7 (las 66 herramientas).
- **Para el chat de producción no cambia nada.**
- Las consultas, filtros y exportaciones permitidas dan los mismos resultados que antes.

## Lo que todavía puede fallar

- El perfil no limita nada por sí solo: solo actúa en quien lo active. El chat de producción **no lo usa** y conserva las 66 herramientas. Por eso siguen vigentes estos riesgos, declarados por el dueño del producto:
  - **El chat puede cerrar tu sesión de Reportia sin pedirte confirmación** (herramienta `reportia_logout`).
  - **El chat puede crear o cambiar datos sin pedir confirmación** en 10 casos: crear o actualizar mapeos de cuentas, de vendedores, de grupos de línea y de centros de costo, y reportes de centro de costo.
  - **Hasta que Reportia las enmascare (RPT-59), tres consultas devuelven claves en claro**: la configuración de facturación (claves de correo), la configuración de SIIGO (contraseña) y la lista de clientes de SIIGO.
  - **El chat puede enviar facturas por correo.**
- Las exportaciones a Excel y PDF guardan archivos en el servidor donde corre el paquete; no escriben en Reportia.

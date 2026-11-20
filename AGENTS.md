# AGENTS.md — mcp-reportia

Guía para quien trabaje en este repositorio, sea una persona o un agente de código.

## Reglas del repositorio

- **Idioma**: la documentación, las notas de release y los mensajes de commit están en español. El
  código, los nombres de herramientas MCP y las variables de entorno siguen el idioma que ya usan.
- **Pruebas**: antes de proponer un cambio, corre `npm run typecheck && npm test && npm run build`.
  Después de compilar, corre los smokes: `npm run test:smoke` y `npm run test:smoke:readonly`.
  `npm run test:integration` necesita una instalación de Reportia accesible y es opcional.
- **Commits**: mensaje breve en español con prefijo de tipo (`feat`, `fix`, `docs`, `test`, `chore`,
  `ci`). Un cambio por commit. Nada de push directo a `main`: se trabaja en una rama y se abre un PR.
- **Notas de release**: todo cambio que llega a quien usa el paquete se explica en `release-notes/`,
  en lenguaje de quien lo usa, no de quien lo desarrolla. La convención está en
  [`release-notes/README.md`](./release-notes/README.md). Los cambios de infraestructura van en
  `CHANGELOG.md`, no en la nota.
- **Este repositorio es público**: no se publican identificadores internos de trabajo, rutas locales,
  credenciales ni el detalle de huecos de seguridad. Si un fallo conocido afecta a quien usa el
  paquete, la nota de release lo dice de forma general y sin explicar cómo se explota.

<!-- ai-factory-method:inicio -->
## Método de la AI Factory

Este repo trabaja con el método común de la AI Factory: **ai-factory-method v0.6.0**
(repositorio privado del método).

Al iniciar y después de cada compactación, todo agente:

1. Carga la constitución del método en `ai-factory-method/CONSTITUCION.md` (en esta máquina:
   el checkout del método de la instancia) y la ficha de su rol (`roles/<rol>/SKILL.md`).
2. Lee el item de trabajo en el gestor de la instancia (el gestor de trabajo de la instancia) antes de tocar código.
3. Sigue las reglas de operación de `operacion.yaml` y el modelo de estados de `estados.yaml`.
4. Deja cada traspaso como artefacto en git o en el gestor: lo que queda solo en una conversación
   no cuenta.
5. Al entregar, revisa si tu corrida encontró un hueco del método y, si lo encontró, propón la mejora
   como PR al repo del método (`plantillas/mejora.md`); si no, deja dicho que no lo encontró
   (decisión 0020).

Lo que este archivo dice de más vale para este repo; ante conflicto con el método, manda lo más
estricto y se avisa al lead de la instancia.
<!-- ai-factory-method:fin -->

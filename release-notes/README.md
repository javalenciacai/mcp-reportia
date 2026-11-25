# Notas de release — mcp-reportia

Cada versión publicada de `@james.valencia/mcp-reportia` cierra con un **release**. Un release son
tres cosas:

1. **Una versión (semver) y su tag en git** (`v0.3.7`, `v0.4.0`…).
2. **Una nota de release dirigida a quien usa el paquete**, en este directorio.
3. **La anotación de qué versión está en uso en cada entorno**, que lleva quien mantiene el paquete.

Mientras no existan el tag y la publicación, la nota es un borrador: **no hay release**.

## Para quién se escribe

Para quien instala el paquete y lo conecta a un cliente MCP (un asistente de IA, un agente, una
aplicación propia), y para quien usa ese asistente para consultar Reportia. La nota dice **qué
pasa diferente para esa persona**: qué herramientas aparecen, cambian o dejan de existir, qué
variables de entorno se pueden usar y qué se corrige. Se escribe en español, tratando de **tú**.

| ❌ técnico | ✅ para quien usa el paquete |
|---|---|
| `fix(client): forward opts.query to buildUrl` | "Los filtros que le pides al asistente (fechas, NIT, límite) ya llegan completos a Reportia." |
| `feat: add cookie auth mode` | "Puedes conectar el paquete con una sesión ya iniciada usando `REPORTIA_COOKIE`." |
| `ci: retry con backoff` | No va en la nota: no cambia nada para quien usa el paquete. |

## Nombre del archivo

`AAAA-MM-DD-mcp-reportia.md` con la fecha en que se publica la versión. Si ese día hay más de una
nota, o la nota corresponde a una versión ya publicada, se agrega la versión:
`AAAA-MM-DD-mcp-reportia-vX.Y.Z.md`. La fecha de una versión ya publicada es la de su tag
(`git log -1 --format=%ad --date=short vX.Y.Z`).

## Cómo se escribe

Cada nota empieza con el nombre del paquete, la versión y la fecha, y tiene tres secciones:

- **Qué vas a notar**: los cambios visibles. Qué herramientas aparecen, cambian o se corrigen y
  qué variables de entorno se pueden usar. Promete solo lo que el cambio hace.
- **Lo que NO cambia**: para que nadie espere de más. Lo que sigue igual se dice de forma explícita.
- **Lo que todavía puede fallar**: los problemas conocidos que alguien puede encontrar, con el
  rodeo si lo hay. Una nota que oculta un problema conocido es peor que no tener nota. Si de una
  versión no se puede saber qué cambió para quien la usa, la nota lo dice
  («sin cambios visibles para quien usa el paquete») y no inventa.

Reglas:

- **Sin jerga interna**: nada de nombres de clases, ramas, tickets ni commits. Sí van los nombres
  de las herramientas MCP (`reportia_movements_list`) y de las variables de entorno
  (`REPORTIA_COOKIE`), porque son lo que la persona escribe o ve.
- Si un cambio es de seguridad, se explica **qué dejó de estar abierto**, no cómo se explotaba.
- Los cambios que solo son de infraestructura (CI, publicación, pruebas, documentación interna)
  **no van en la nota**: van en el [`CHANGELOG.md`](../CHANGELOG.md) técnico o en el release de
  GitHub.
- La nota describe lo que **está publicado** en esa versión, verificado contra el código del tag.
- Una nota de una versión ya publicada que descubre un fallo posterior lo declara en «Lo que
  todavía puede fallar», indicando en qué versión se corrigió.

## Dónde está cada cosa

| Qué | Dónde |
|---|---|
| Notas de release | `release-notes/AAAA-MM-DD-mcp-reportia[-vX.Y.Z].md` |
| Esta convención | `release-notes/README.md` |
| Registro técnico | [`CHANGELOG.md`](../CHANGELOG.md) |
| Versión y tag | git, en este repositorio |
| Paquete publicado | [`@james.valencia/mcp-reportia`](https://www.npmjs.com/package/@james.valencia/mcp-reportia) en npm |

Una versión sin nota para quien usa el paquete no está terminada: la nota es parte de la entrega.

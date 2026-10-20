# Diagramas de arquitectura

Diagramas de ViaSegura en Mermaid, que GitHub dibuja al abrir cada archivo. La norma está en [`ARCHITECTURE.md`](../../ARCHITECTURE.md); estos diagramas la ilustran (los manuales) o muestran el código como es (los generados).

| Diagrama | Archivo | Origen | Tipo Mermaid |
|---|---|---|---|
| C4 · contexto: actores y sistemas externos | [c4-contexto.md](c4-contexto.md) | manual | `flowchart` |
| C4 · contenedores: PWA, API, base de datos, servicios externos e inferencia (planificado) | [c4-contenedores.md](c4-contenedores.md) | manual | `flowchart` |
| Capas y qué puede depender de qué (backend, frontend, inferencia) | [capas.md](capas.md) | manual, según §3–§6 | `flowchart` |
| Módulos del backend y features del frontend, con sus dependencias reales | [modulos.md](modulos.md) | **generado** desde los `import` | `flowchart` |
| Modelo de datos (ER) y vistas materializadas | [modelo-datos.md](modelo-datos.md) | **generado** desde las migraciones Flyway | `erDiagram`, `flowchart` |

## Cómo se regeneran

Con la skill `/diagramas` (`.claude/skills/diagramas/`), a pedido y al cerrar cada sprint, antes de la release. La skill corre tres extractores en Node, sin dependencias:

| Extractor | Lee | Escribe el bloque |
|---|---|---|
| `modulos-backend.mjs` | `import` entre paquetes de primer nivel de `pe.edu.upc.viasegura` y la tabla de §4.3 | `modulos-backend` en `modulos.md` |
| `features-frontend.mjs` | `import` de `frontend/src` (sin tests ni tipos generados) | `features-frontend` en `modulos.md` |
| `modelo-datos.mjs` | `backend/src/main/resources/db/migration/V*.sql`, en orden de versión | `modelo-datos` en `modelo-datos.md` |

Desde la raíz del repo:

```bash
node .claude/skills/diagramas/generar.mjs --comprobar   # ¿cambió algo? (sale con 1 si sí; no escribe)
node .claude/skills/diagramas/generar.mjs               # reescribe solo los bloques que cambiaron
node .claude/skills/diagramas/validar.mjs               # dibuja cada bloque con mermaid-cli
```

La salida es estable (orden alfabético, sin fechas): sin cambios en el código, una segunda corrida no cambia nada y el diff de un PR de diagramas muestra solo lo que cambió de verdad.

## Qué parte es manual

- Todo `c4-contexto.md`, `c4-contenedores.md` y `capas.md`.
- En `modulos.md` y `modelo-datos.md`, todo lo que está **fuera** de los marcadores `<!-- generado:inicio <bloque> -->` / `<!-- generado:fin <bloque> -->`. Lo de adentro se sobrescribe en cada corrida.

Los diagramas manuales se revisan a mano en la misma rama cuando cambia lo que dibujan: un actor, un contenedor, un protocolo o una sección de `ARCHITECTURE.md`.

## Cuando un diagrama contradice la norma

Los diagramas generados dibujan el código como es. Una dependencia que §4.3 o §5 no permiten aparece punteada y en rojo, y se lista bajo el diagrama. No se «arregla» en el dibujo ni se cambia `ARCHITECTURE.md` desde aquí: se registra con `/propuesta` (o se corrige en el código, en una tarea propia).

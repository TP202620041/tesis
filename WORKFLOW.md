# Workflow de agentes de Claude — ViaSegura

> **Documento normativo**, igual que `ARCHITECTURE.md`. Define quién hace qué, cómo avanza una tarea desde el plan hasta `main` y qué lo hace cumplir automáticamente.
> Versión 1.0 · 2026-10-11. Configuración en `.claude/` (raíz) y en `backend/.claude/` y `frontend/.claude/`.

## 1. Idea central

Cada agente de Claude Code trabaja **en una sola carpeta, en una sola tarea, en una sola rama**. Las decisiones las toma el usuario; los agentes ejecutan, verifican con números y piden revisión antes de proponer un cambio. Lo que importa no depende de que el agente "se acuerde": lo imponen hooks, ArchUnit y ESLint.

```
 plan-migracion-capas.md ──► /tarea BE-02 ──► rama arq/be-02 ──► implementar ──► /verificar ──► /revisar ──► PR ──► el usuario fusiona
        ▲                                                                                                                │
        └──────────────────────────── el agente marca [x] y anota métricas en el plan ◄─────────────────────────────────┘
```

## 2. Roles

| Rol | Quién | Dónde corre | Puede escribir en | Responsabilidad |
|---|---|---|---|---|
| **Arquitecto y PO técnico** | El usuario | — | Todo | Decide (D-xx, propuestas), aprueba planes de tareas NC, fusiona PR. |
| **Coordinador** | Sesión de Claude en la raíz (`tesis/`) | Claude Code en la raíz o la app de Claude enlazada a la carpeta | Todo, salvo generados | Mantiene `ARCHITECTURE.md`, `WORKFLOW.md`, el plan y las guardas; convierte decisiones en tareas; diagnostica. |
| **Agente de backend** | Claude Code iniciado en `backend/` | `backend/` | `backend/`, el plan, `handoffs/`, `decisions/propuestas/` | Ejecuta tareas `BE-*` y la parte backend de `NC-*`. |
| **Agente de frontend** | Claude Code iniciado en `frontend/` | `frontend/` | `frontend/`, el plan, `handoffs/`, `decisions/propuestas/` | Ejecuta tareas `FE-*` y la parte frontend de `NC-*`. |
| **Agente de inferencia** | Claude Code en `inferencia/` (futuro, NC-03) | `inferencia/` | `inferencia/` y lo mismo | Servicio FastAPI + ONNX. |
| **Revisor de arquitectura** | Subagente `revisor-arquitectura` (modelo Opus, solo lectura) | Lo lanza `/revisar` dentro de la sesión del agente | Nada | Revisa el diff contra las normas sin haber visto cómo se escribió. |

**Cómo iniciar cada agente:** abre una terminal en la carpeta (`cd backend` y luego `claude`). Claude Code carga el `CLAUDE.md` de esa carpeta y los de las carpetas superiores, las skills y subagentes de `.claude/` de la raíz, y los hooks del `.claude/settings.json` **de la carpeta donde arrancó** (por eso cada carpeta tiene el suyo).

**Higiene de contexto:** una tarea por sesión. Al cerrar una tarea, `/clear` antes de la siguiente. Si una tarea se alarga, `/compact` con un resumen de lo que falta.

## 3. Ciclo de una tarea

| Paso | Comando | Qué pasa | Sale cuando… |
|---|---|---|---|
| 1. Elegir | — | El usuario indica la tarea (o el agente propone la siguiente sin dependencias abiertas). | Hay un ID: `BE-02`, `FE-03`, `NC-01`… |
| 2. Abrir | `/tarea BE-02` | Lee la tarea y las secciones de `ARCHITECTURE.md`; verifica dueño y dependencias; crea la rama desde `main` actualizado. | Rama `arq/be-02` (o `feat/nc-01-municipalidades`). |
| 3. Planificar | (dentro de `/tarea`) | Lista archivos y tests. En `NC-*` espera tu aprobación; en `BE/FE-*` con lista explícita, continúa. | Plan visible en la conversación. |
| 4. Implementar | — | Cambios mínimos para los criterios de aceptación. Duda de diseño → `/propuesta` y se detiene. Cambio de contrato → `/contrato`. | Compila y los tests nuevos/movidos pasan. |
| 5. Verificar | `/verificar` | Corre la definición de terminado y cuenta métricas con scripts. | Ninguna métrica peor que la línea base. |
| 6. Revisar | `/revisar` | El subagente revisor lee el diff y da veredicto. | APTO, o hallazgos corregidos. |
| 7. Cerrar | (dentro de `/tarea`) | Marca `[x]` en el plan con métricas antes → después; push de la rama; abre el PR. | PR abierto. |
| 8. Fusionar | El usuario | Revisa el resumen del PR y fusiona (squash). | `main` actualizado. |

**Definición de terminado** (la mide `/verificar`):

| Carpeta | Condición |
|---|---|
| backend | `mvn clean verify` en verde; `completed` de Failsafe igual o mayor (igual en tareas ARQ); violaciones congeladas de ArchUnit iguales o menos. |
| frontend | `npm run typecheck`, `npm test` (con su guarda) y lint en verde; avisos de capas iguales o menos (salvo archivos que entran por primera vez a un bloque, listados en el PR: ARCHITECTURE.md §5.4). |

## 4. Comandos (skills en `.claude/skills/`)

| Comando | Quién lo usa | Para qué |
|---|---|---|
| `/tarea <ID>` | Agente de carpeta (lo escribes tú) | Ciclo completo de una tarea, del plan al PR. |
| `/verificar` | Agente de carpeta | Definición de terminado con números (`contar-archunit.mjs`, `contar-capas.mjs`). |
| `/revisar [nota]` | Agente de carpeta | Revisión independiente por el subagente `revisor-arquitectura`. |
| `/contrato <tema>` | Backend publica, frontend consume | Handoff escrito de un cambio de API (§6). |
| `/propuesta <tema>` | Cualquier agente | Registrar una duda de diseño para que la decidas tú (§7). |

## 5. Guardas automáticas

| Guarda | Dónde | Qué impide |
|---|---|---|
| **Hook `guardia.mjs`** (PreToolUse) | `.claude/settings.json` de raíz, `backend/` y `frontend/` | Escribir fuera de la carpeta propia; editar `ARCHITECTURE.md`, `WORKFLOW.md`, `CLAUDE.md` raíz, `.claude/`, las guardas de ArchUnit/ESLint o `project-context/` (salvo plan, handoffs y propuestas); editar el almacén de ArchUnit, `generated/schema.ts` o una migración existente; commit en `main`, push a `main`, push forzado, `reset --hard`, `clean -f`, restaurar documentos normativos. |
| **ArchUnit** | `mvn test` | Una violación de capas nueva en el backend. |
| **ESLint de capas** | `npm run lint` | Un import que rompe las capas del frontend (aviso hasta FE-09, luego error). |
| **Revisor** | `/revisar` | Reglas que ninguna herramienta mide: señales internas en DTO, SEC-01, eventos de KPI, limpieza de tests, CSP. |
| **Protección de `main`** (recomendado) | GitHub → Settings → Branches | Que algo llegue a `main` sin PR. |

El hook es una red de seguridad, no un sandbox: un comando de shell podría saltárselo. Si bloquea algo legítimo, el agente lo dice y lo hace la sesión de raíz o tú.

## 6. Cambio de contrato entre backend y frontend

1. **Backend** implementa el cambio (DTO + IT), `/verificar`, y con `/contrato <tema>` escribe `project-context/handoffs/AAAA-MM-DD-<tema>.md` (estado `pendiente`) dentro del mismo PR.
2. **El usuario** fusiona ese PR.
3. **Frontend**, en una tarea propia, corre `/contrato <tema>`: verifica que el cambio esté en `main`, levanta el backend, `npm run api:sync`, ajusta `model/` y marca el handoff `atendido`.

Nunca en paralelo: el frontend no consume un contrato que no está en `main`.

## 7. Decisiones de diseño

1. El agente encuentra algo que no encaja en `ARCHITECTURE.md` → `/propuesta <tema>` → archivo en `project-context/decisions/propuestas/` con opciones y recomendación → se detiene o sigue con lo que no depende de eso.
2. **El usuario** decide (puede pedirle a la sesión de raíz que analice las opciones).
3. **La sesión de raíz** registra la decisión (D-xx en `ARCHITECTURE.md`, ajuste del plan) y marca la propuesta `aceptada` o `rechazada`.

## 8. Ramas y paralelismo

- `main` solo avanza por PR. Ramas: `arq/<id>` para migración, `feat/<id>-<tema>` para núcleo nuevo, `fix/<tema>` para correcciones. Fusión con squash, título igual al del commit principal.
- **En paralelo sí:** una tarea de backend y una de frontend (carpetas distintas, ramas distintas).
- **Dos tareas en la misma carpeta:** usa un worktree por tarea para que no compartan árbol de trabajo:
  `git worktree add ../tesis-be-03 -b arq/be-03` y abre Claude Code en `../tesis-be-03/backend`. Al fusionar: `git worktree remove ../tesis-be-03`.
- **Nunca en paralelo:** dos tareas que tocan los mismos archivos, ni el consumo de un contrato antes de que esté en `main`.
- Antes de empezar cualquier tarea: `git switch main && git pull --ff-only` (lo hace `/tarea`).

## 9. Modelos

| Rol | Modelo | Por qué |
|---|---|---|
| Agentes de carpeta | El de la sesión | Ejecutan tareas acotadas con criterios explícitos. |
| Revisor de arquitectura | Opus | Su valor está en el juicio; corre una vez por tarea. |
| Coordinador | El más capaz disponible | Decide y redacta normas. |

## 10. Puesta en marcha (una vez)

1. Revisa `claude-config/` (sobre todo `raiz/hooks/guardia.mjs` y los `settings.json`) y ejecuta desde la raíz `node claude-config/instalar.mjs`. Copia la configuración a `.claude/`, `backend/.claude/` y `frontend/.claude/`; viene aparte porque las herramientas remotas no pueden escribir en `.claude/`.
   Luego haz commit en una rama `arq/workflow` de `WORKFLOW.md`, las carpetas `.claude/` instaladas (sin `settings.local.json`), `project-context/handoffs/`, `project-context/decisions/propuestas/` y los cambios de `CLAUDE.md`, `.gitignore` y el plan. Borra `claude-config/` y fusiona.
2. Cierra y vuelve a abrir las sesiones de backend y frontend para que carguen hooks y skills. Con `/status`, revisa que la línea de fuentes de configuración incluya la configuración compartida del proyecto.
3. Prueba la guardia: en la sesión de backend pide "edita ../frontend/package.json" y confirma que se bloquea.
4. Requisito: `node` en el PATH de la terminal donde corre Claude Code (ya lo usa el frontend).
5. Recomendado: protege `main` en GitHub (exigir PR para fusionar).

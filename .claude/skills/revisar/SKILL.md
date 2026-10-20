---
name: revisar
description: Pide al subagente revisor-arquitectura una revisión independiente del trabajo de la rama actual contra ARCHITECTURE.md y las reglas del proyecto.
context: fork
agent: revisor-arquitectura
background: false
---

Revisa el trabajo de la rama actual del monorepo Ciudad Viva contra `ARCHITECTURE.md`, el `CLAUDE.md` de la carpeta tocada y, si corresponde, los criterios de aceptación de la tarea en `project-context/decisions/plan-migracion-capas.md`.

Contexto adicional del autor (puede estar vacío): $ARGUMENTS

Sigue tu lista de verificación y responde con el veredicto y los hallazgos.

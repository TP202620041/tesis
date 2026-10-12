---
name: verificar
description: Corre la definición de terminado de la carpeta actual (backend o frontend) y reporta las métricas comparables con la línea base del plan.
---

Corre la definición de terminado de `WORKFLOW.md` (sección 3, paso 5) para la carpeta donde estás trabajando y reporta números, no impresiones. La raíz del repo es `$(git rev-parse --show-toplevel)`; los scripts de esta skill están en `.claude/skills/verificar/`.

## Backend (sesión en `backend/`)
Antes: configura el entorno como dice `backend/CLAUDE.md` (JAVA_HOME a JDK 21, `POSTGRES_PORT=5433`, contenedor `viasegura-db` arriba).
1. `mvn test -Dtest=ArquitecturaCapasTest` (rápido; falla si hay una violación de capas nueva).
2. `mvn clean verify`.
3. Reporta:
   - `completed`, `errors`, `failures` de `target/failsafe-reports/failsafe-summary.xml`.
   - Violaciones congeladas: `node <raiz>/.claude/skills/verificar/contar-archunit.mjs`.
   - Cobertura de líneas de `target/site/jacoco/jacoco.csv` si el usuario la pide.

## Frontend (sesión en `frontend/`)
1. `npm run typecheck`
2. `npm test` (con su guarda; cita el total de archivos y tests).
3. `npx eslint -f json -o .eslint-capas.json .` y luego `node <raiz>/.claude/skills/verificar/contar-capas.mjs .eslint-capas.json`. Borra `.eslint-capas.json` al terminar.

## Reporte
Una tabla corta: métrica | línea base (del plan) | ahora | ¿empeoró? Si algo empeoró o falló, dilo primero y no declares la tarea terminada.

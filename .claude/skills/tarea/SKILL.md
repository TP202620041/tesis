---
name: tarea
description: Inicia y lleva hasta el PR una tarea del plan de migración o del núcleo nuevo (BE-xx, FE-xx, NC-xx), siguiendo WORKFLOW.md.
argument-hint: "[ID de la tarea, p. ej. BE-02]"
disable-model-invocation: true
---

Vas a ejecutar la tarea **$ARGUMENTS** siguiendo `WORKFLOW.md` (sección 3). Sigue los pasos en orden y no te saltes ninguno.

## 1. Entender
- Lee la tarea $ARGUMENTS en `project-context/decisions/plan-migracion-capas.md` (está en la raíz del monorepo; súbete con `git rev-parse --show-toplevel`).
- Lee las secciones de `ARCHITECTURE.md` que la tarea cita.
- Comprueba que la tarea es de tu carpeta: `BE-*` es del agente de backend, `FE-*` del de frontend, `NC-*` según la tabla del plan. Si no es tuya, detente y dilo.
- Comprueba sus dependencias en el plan. Si alguna sigue abierta, detente y dilo.

## 2. Preparar la rama
- `git status` debe estar limpio. Si no lo está, detente y pregunta al usuario qué hacer con esos cambios.
- `git switch develop` y `git pull --ff-only` (GitFlow: toda tarea sale de `develop`, nunca de `main`).
- Crea la rama: `git switch -c feature/<id-en-minúsculas> develop` para BE/FE (p. ej. `feature/be-02`), `feature/<id>-<tema-corto>` para NC (p. ej. `feature/nc-01-municipalidades`). Si estás en un worktree donde `develop` está tomado por otro, créala con `git switch -c feature/<id> origin/develop` tras un `git fetch`.

## 3. Planificar
- Lista los archivos que vas a crear, mover o modificar y qué test cubre cada cambio.
- Tareas `NC-*` (funcionalidad nueva) o cualquier tarea donde el plan no diga exactamente qué mover: presenta el plan al usuario y **espera su aprobación**.
- Tareas `BE-*`/`FE-*` con lista explícita de archivos: muestra el plan y continúa.

## 4. Implementar
- Cambios mínimos para cumplir los criterios de aceptación. Sin refactors fuera del alcance.
- Si descubres un problema de diseño, no lo resuelvas inventando estructura: usa `/propuesta` y detente.
- Si cambias un contrato del API (backend), aplica `/contrato` antes de cerrar.

## 5. Verificar
- Ejecuta `/verificar` y compara con la línea base anotada en el plan. Si alguna métrica empeora, corrige antes de seguir.

## 6. Revisar
- Haz commit en la rama: `ARQ $ARGUMENTS: <resumen>` (o `NC-xx: …`), sin línea `Co-Authored-By` (decisión del usuario).
- Ejecuta `/revisar`. Corrige todo hallazgo bloqueante o importante y vuelve a `/verificar` si tocaste código.

## 7. Cerrar
- En el plan, marca `[x]` en la tarea con la fecha y las métricas de `/verificar` (antes → después). Commit `ARQ $ARGUMENTS: cierre en el plan`.
- `git push -u origin <rama>`. Si `gh` está disponible, abre el PR con `gh pr create --base develop --fill`; si no, dale al usuario el enlace para abrirlo. Nunca `git flow feature finish` (fusiona en local sobre `develop`, que está protegida).
- Termina con un resumen de 5 líneas: qué cambió, métricas antes → después, veredicto del revisor y qué decide el usuario (si algo).
- **No fusiones el PR.** Lo fusiona el usuario.

---
name: diagramas
description: Regenera desde el código los diagramas de arquitectura de docs/arquitectura/ (módulos y dependencias, modelo de datos) y los deja en su propia rama y PR. Usar a pedido y al cerrar un sprint, antes de la release.
argument-hint: "[motivo opcional, p. ej. cierre S4]"
---

Actualiza los diagramas Mermaid de `docs/arquitectura/` (índice en su `README.md`). Corre desde la raíz del repo (`git rev-parse --show-toplevel`). Los scripts de esta skill están en `.claude/skills/diagramas/`. Motivo: $ARGUMENTS

## Cuándo
- Cuando el usuario la pide.
- Al cerrar un sprint, antes de abrir la `release/*`: la versión etiquetada lleva los diagramas al día.

## 1. Preparar la rama
- `git status` limpio. Si no lo está, detente y pregunta.
- `git fetch` y `git switch -c feature/diagramas-AAAA-MM-DD origin/develop` (fecha de hoy).

## 2. Correr los extractores y comparar
- `node .claude/skills/diagramas/generar.mjs --comprobar`. Por bloque dice «sin cambios» o «cambiaría (+a −b líneas)», y lista las diferencias con la norma. No escribe nada.
- Si todos los bloques dicen «sin cambios» y los diagramas manuales siguen vigentes (paso 4), dilo y termina: borra la rama, sin commit ni PR.

## 3. Regenerar solo lo que cambió
- `node .claude/skills/diagramas/generar.mjs`. Reescribe solo lo que está entre `<!-- generado:inicio <bloque> -->` y `<!-- generado:fin <bloque> -->`. El texto de fuera es manual y no se toca.
- Si avisa de una sentencia SQL o de una acción de `ALTER TABLE` que no supo interpretar, amplía `modelo-datos.mjs` y vuelve a correr. No publiques un modelo de datos incompleto.
- Revisa el diff con `git diff docs/arquitectura/`. Si cambia algo que el código no cambió, el error está en el extractor: corrígelo.
- Idempotencia: `generar.mjs --comprobar` otra vez tiene que decir «sin cambios» en todos los bloques.

## 4. Revisar los diagramas manuales
`c4-contexto.md`, `c4-contenedores.md` y `capas.md` no se generan. Compáralos con lo que cambió desde la última corrida (`git log` de `ARCHITECTURE.md`, `docker-compose.yml`, `application.yml`, `next.config.ts`, módulos o grupos de rutas nuevos). Si un actor, contenedor, protocolo o regla de capas cambió, actualízalos en esta misma rama, con su frase de lectura.

## 5. Validar el Mermaid
- `node .claude/skills/diagramas/validar.mjs`. Dibuja cada bloque con mermaid-cli en un directorio temporal. Tiene que terminar en «N/N diagramas válidos».
- Si mermaid-cli no corre (sin red o sin Chromium; sale con 3), revisa a mano que cada bloque empiece con un tipo válido (`flowchart`, `erDiagram`) y dilo en el resumen.

## 6. Commit y PR
- Commit: `DOC: diagramas de arquitectura (<qué cambió en pocas palabras>)`, sin línea `Co-Authored-By`.
- `git push -u origin feature/diagramas-AAAA-MM-DD` y `gh pr create --base develop` con el resumen del paso 7 en el cuerpo. No fusiones: lo fusiona el usuario.

## 7. Decir qué cambió
Un resumen corto para el usuario:
- Qué bloques cambiaron y qué significa: módulo o feature nuevo, dependencia nueva o eliminada, tabla, columna o FK nueva.
- Las diferencias con la norma que listaron los extractores, separando las nuevas de las que ya estaban.
- El resultado de la validación de Mermaid y de la prueba de idempotencia.

## Qué no hace
- **No edita `ARCHITECTURE.md`**, `WORKFLOW.md`, `CLAUDE.md` ni `project-context/`, ni código de `backend/` o `frontend/`.
- Si un diagrama derivado del código contradice la norma (p. ej., una dependencia entre módulos que §4.3 no permite), **no la «arregla» en el dibujo**: la dibuja como es (punteada y en rojo), la lista bajo el diagrama y sugiere `/propuesta`. Si ya hay una propuesta abierta sobre esa dependencia en `project-context/decisions/propuestas/`, la cita en vez de sugerir otra.
- No reemplaza las guardas: la cifra oficial de capas sigue siendo la de ArchUnit y `eslint.capas.mjs` (`/verificar`).
- No corre `mvn` ni levanta servidores: solo lee archivos.

# Plan de sprints

> Aprobado por el usuario el 2026-10-13. Sprints de **1 semana**, sin fecha fija. Alcance: historias de usuario (HU) incompletas, núcleo nuevo (NC-01..NC-07) y la migración de capas restante (`plan-migracion-capas.md`).
> Cómo se ejecuta cada tarea: `WORKFLOW.md` (GitFlow: `feature/<id>` desde `develop`, revisor, PR a `develop`). Cada sprint cierra con `release/v0.N.0` → `main`, etiquetado.

## Punto de partida (auditoría del 2026-10-13, sobre `develop` e6569f1)

`v0.1.0` no tiene completas US-01..US-30: hay 16 completas, 10 parciales y 4 que faltan. Del núcleo nuevo no hay nada.

| HU | Estado | Falta | Backend listo |
|---|---|---|---|
| US-03 | Parcial | Pantallas para pedir el token y restablecer la contraseña (`app/(auth)/recuperar-password` vacía); enlace desde el login. El correo manda un token, no un enlace (`PasswordResetService`). | Sí |
| US-04 | Parcial | Botón de cerrar sesión en las vistas del ciudadano (hoy solo en `bandeja` y en `sesion`). | Sí |
| US-06 | Parcial | Cola de Background Sync en `src/pwa/sw.ts` para `POST /api/reportes`, con la misma `Idempotency-Key`. | Sí |
| US-11 | Falta | Endpoint de densidad (con política de caché, `backend/README.md`) y capa de calor en `src/map/`. | No |
| US-12 | Parcial | Filtro de fechas en la búsqueda pública y vista de resultados en lista. | Sí |
| US-17 | Parcial | `app/(municipal)/dashboard` vacía; nadie llama a `GET /api/desempeno/mi-distrito`. | Sí |
| US-19 | Por validar | Contrastar con el Gherkin del PDF (no está en el repo); vista de comparación si hace falta. | ? |
| US-21 | Falta | Web Push real: VAPID, adaptador push (hoy es un stub), suscripción en el frontend y manejador `push` en el SW. Necesita NC-07. | No |
| US-23 | Falta | Selector de modo oscuro y alto contraste, con la preferencia guardada (hoy solo `prefers-color-scheme`). | n/a |
| US-24 | Falta | Guía de uso en `app/(public)/guia` (vacía). | n/a |
| US-25 | Parcial | UI de soporte (`features/soporte` vacía) y vista del ADMIN. | No: el ADMIN no puede listar todos los tickets |
| US-28 | Parcial | Botón de exportar en la bandeja (blob con token y los filtros activos). | Sí |
| US-29 | Parcial | Pantalla de alta de categorías. | No: faltan editar y desactivar (`activo`) |

Completas: US-01, 02, 05, 07, 08, 09, 10, 13, 14, 15, 16, 18, 20, 22, 26, 27 y 30 (US-30 guarda la preferencia PUSH, pero no hace nada hasta US-21).

## Sprints

Hay un carril de backend y uno de frontend en paralelo. En un mismo sprint el frontend no hace a la vez una HU y una tarea de migración que toquen los mismos archivos. Todo lo nuevo nace en capas (ARCHITECTURE.md §4 y §5).

| Sprint | Backend | Frontend | Versión |
|---|---|---|---|
| S1 | BE-03 · BE-04 · BE-05 | US-03 · US-04 · US-28 · US-17 (sobre `/mi-distrito`) | v0.2.0 |
| S2 | US-25 (listado del ADMIN) · US-29 (editar/desactivar) · NC-07 | US-25 · US-29 · US-12 · FE-03 · FE-04 | v0.3.0 |
| S3 | NC-07b (consentimiento, D-12) · US-21 (adaptador Web Push + VAPID) | NC-07b (aceptación en registro e inicio de sesión, `/privacidad`) · US-21 (suscripción + `push` en el SW) · US-06 · FE-05 | v0.4.0 |
| S4 | US-11 (endpoint de densidad) · BE-06 (incluye `ReincidenciaDetector` → `domain/`) · BE-10 | US-11 (capa de calor) · FE-06 | v0.5.0 |
| S5 | NC-01 · NC-02 | US-19 · FE-07 · FE-08 | v0.6.0 |
| S6 | NC-05 · NC-06 · BE-08 | NC-06 (dashboard por periodo, reemplaza US-17 v1) · FE-09 | v0.7.0 |
| S7 | NC-03 (`inferencia/`) · NC-04 (`clasificacion`) | NC-04 (vista previa al reportar) | v0.8.0 |
| S8 | Ajustes que pida el diseño | **Diseño de la interfaz**: sistema visual (tokens, tipografía y color), componentes, revisión de cada pantalla, US-23 (modo oscuro y alto contraste) y US-24 (guía de uso) | v1.0.0 |

Ya hechas antes de S1: BE-01, BE-02, BE-07, FE-01 y FE-02.

## Decisiones del usuario que bloquean sprints

| Antes de | Decisión |
|---|---|
| S5 | US-19: el Gherkin del PDF (pegarlo en `backlog/product_backlog.md`). |
| S5 | D-10: jurisdicción del funcionario (`distrito_id` o `municipalidad_id`) y las fechas exactas del periodo 2023-2026. |
| S6 | Fórmulas de los KPIs por periodo; requisitos de recepción por municipalidad (NC-05). |
| S7 | Clases finales del modelo y umbral (NC-03). Mientras tanto, NC-04 usa un adaptador falso. |

## Ejecución

- Los subagentes los lanza el coordinador: **como máximo 2 a la vez** (uno de backend y uno de frontend), por la memoria de la máquina. Cada uno trabaja en un worktree con `feature/<id>` desde `origin/develop` y sigue `.claude/skills/tarea/SKILL.md`.
- Las tareas de backend van una tras otra, porque comparten la BD `viasegura_test` y el almacén de ArchUnit.
- Cambio de contrato (US-25, US-29, US-21, US-11): primero el backend con su handoff (`/contrato`). El frontend arranca cuando ese PR está en `develop`.
- Cada tarea pasa por `revisor-arquitectura` antes del PR. Commits `US-xx: …`, `ARQ …` o `NC-xx: …`, sin `Co-Authored-By`.
- Definición de terminado: la de `WORKFLOW.md` §3. En las HU con interfaz, además, verificación en vivo del flujo con el backend y el frontend levantados (de a uno, por la memoria).

## Registro

- **S1 (2026-10-13):** fusionados BE-03, BE-04, BE-05 (#12–#14), el CORS de `Content-Disposition` (#15), US-03 (#16), US-04 (#17, con la caché del API fuera del Service Worker), US-28 (#18) y US-17 (#19). Almacén de ArchUnit 52 → 51; Failsafe 177 → 178; frontend 80 → 126 tests, avisos de capas 66 → 65. Decisiones del usuario: se acepta el cierre de BE-03; `ReincidenciaDetector` pasa a `domain/` en BE-06; nueva tarea BE-10 (sin `MultipartFile` en `service/`), en S4.
- **S2 (2026-10-19, v0.3.0):** US-25 (#26, #36), US-29 (#27, #37), NC-07 (#33), US-12 (#30, #31), FE-03 (#29), FE-04 (#28), SEC-02 (#32, #35), D-12 (#25, #34), y el arreglo de la guardia (#24). Failsafe 178 → 238, Surefire 11 → 37, ArchUnit 51 → 48; frontend 136 → 232 tests, avisos de capas 64 → 44. Verificación en vivo: 27 comprobaciones del API y las pantallas nuevas en el navegador.
- **Plan del S3 (2026-10-19):** backend B1 NC-07b consentimiento (D-12) → B2 US-21 push real (librería web-push, VAPID por variables de entorno); frontend F1 FE-05 → F2 US-06 cola offline (si el token venció, el reporte se conserva y se reenvía tras iniciar sesión) → F3 NC-07b en la PWA → F4 US-21 en la PWA. Coordinador: borrador del texto legal (`project-context/legal/terminos-y-privacidad-v1.md`). La sesión de diseño de la interfaz pasa a un **S8** propio antes de v1.0 (decisión del usuario), que absorbe US-23 y US-24; S7 cierra en v0.8.0.
- **S3 (2026-10-20, v0.4.0):** FE-05 (#41), NC-07b backend (#42) y PWA (#46), US-21 backend (#43) y PWA (#52; reemplaza a #47 y #50), US-06 (#44), D-13 y D-14 (#45), borrador legal (#40). Adelantos del S4 que entran en esta versión: BE-10 (#48), BE-06 parcial (#49) y US-11 backend (#51). Failsafe 238 → 284, Surefire 37 → 57, ArchUnit 48 → 3; frontend 232 → 473 tests, avisos de capas 44 → 18. Verificación en vivo con claves VAPID de desarrollo: 16 comprobaciones del API y, en Chrome, términos, consentimientos y un push real por FCM mostrado por el Service Worker, con la baja al cerrar sesión y el re-registro al volver a entrar. Para decidir: `propuestas/2026-10-20-asignacion-geo-en-distritos.md` (cierra BE-06). Para el S8: falta `/icons/icon-512.png` del manifest.
- **S4 (2026-10-20, v0.5.0):** FE-06 (#55), US-11 PWA (#57; el backend entró en #51), BE-06 cerrada con la opción A de la propuesta (#58), diagramas de arquitectura (#56) y US-01 términos en diálogo sin pestaña nueva (#59, pedido del usuario). ArchUnit 3 → 0 con Failsafe 284 y Surefire 57 sin cambios; frontend 473 → 547 tests, avisos de capas 18 → 0. Desde S4 la máquina de desarrollo es macOS con JDK 21 (`/opt/homebrew/opt/openjdk@21`) y PostgreSQL en 5432; los IT necesitan `TEST_DB_URL=jdbc:postgresql://localhost:5432/viasegura_test` mientras `AbstractPostgisIT` apunte a 5433. Pendiente para BE-08: la ruta vieja de `PointInPolygonAssignmentStrategy` en `backend/CLAUDE.md`. Antes del S5 siguen pendientes el Gherkin de US-19 y D-10.
- **S5 (2026-10-21, v0.6.0):** FE-07 (#69), FE-08 (#71), build con esbuild (#72), NC-01 parcial (#70; GESTION_MUNICIPAL y REQUISITO_RECEPCION con NC-06/NC-05, propuesta aceptada opción A), US-19 con criterios provisionales (#68, #73), NC-02 backend (#74) y PWA (#79), mapa sin calles en producción por la CSP del Service Worker (#78), marca visible Ciudad Viva (#62–#66), §10 de responsabilidad sobre fotos en los términos (#64, #67) y diagramas (#80). Failsafe 284 → 309, Surefire 57 → 62, ArchUnit 0 → 0; frontend 547 → 646 tests (76 → 83 archivos), avisos de capas 0. Verificación en vivo en Windows con túneles HTTPS (`cloudflared`) hacia la build de producción. Siguen abiertos para el S6: el Gherkin original de US-19, D-10 y las fórmulas de los KPIs.

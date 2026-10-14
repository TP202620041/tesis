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
| S4 | US-11 (endpoint de densidad) · BE-06 (incluye `ReincidenciaDetector` → `domain/`) · BE-10 | US-11 (capa de calor) · US-23 · US-24 · FE-06 | v0.5.0 |
| S5 | NC-01 · NC-02 | US-19 · FE-07 · FE-08 | v0.6.0 |
| S6 | NC-05 · NC-06 · BE-08 | NC-06 (dashboard por periodo, reemplaza US-17 v1) · FE-09 | v0.7.0 |
| S7 | NC-03 (`inferencia/`) · NC-04 (`clasificacion`) | NC-04 (vista previa al reportar) | v1.0.0 |

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

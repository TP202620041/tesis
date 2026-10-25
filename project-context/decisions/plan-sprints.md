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
| Despliegue | DEP-01..DEP-05 · DEP-08 · DEP-11 · DEP-12 · correcciones de QA-1 · CI (DEP-07) | DEP-06 · correcciones de QA-1 · fase 1 del diseño «Cívica» (DIS-1, con US-23) | v0.7.0 |
| S7 | NC-03a (`inferencia/`) · NC-04 (`clasificacion`) · BE-11 (la foto se sube fuera de la transacción de creación) | NC-04 (vista previa al reportar) · FE-09 (adelantada) · atribución de RDD2022 (CC BY-SA 4.0) y de los pesos RF-DETR (Apache-2.0) en «Acerca de» o en los términos | v0.8.0 |
| S6 | NC-05 · NC-06 · BE-08 | NC-06 (dashboard por periodo, reemplaza US-17 v1) | v0.9.0 |
| S8 | Ajustes que pida el diseño | **Diseño de la interfaz, fase 2** (mapa con hoja inferior, reporte en pasos, bandeja con panel, portada y desempeño), revisión de cada pantalla y US-24 (guía de uso) | v1.0.0 |

**El S7 va antes que el S6 (decisión del usuario del 25/10).** El S6 está bloqueado por tres decisiones pendientes: las fórmulas de los KPIs, las columnas del OB2 §5 y D-10. El S7 no está bloqueado: las clases y el umbral se decidieron el 21/10. Por eso el S7 sale como v0.8.0 y el S6 como v0.9.0. FE-09 no depende de nada del S6, así que se adelantó y quedó hecha el 25/10. Los nombres S6 y S7 se conservan, para no romper las referencias.

**NC-03 se parte en dos:** NC-03a es el servicio (S7) y NC-03b, la calibración del umbral con al menos 200 fotos de Lima. NC-03b depende de que el equipo tome y etiquete esas fotos, así que no tiene sprint fijo. **La atribución** la pide la revisión de NC-03a (25/10): los datos de RDD2022 son CC BY-SA 4.0 y los pesos, Apache-2.0. Tiene que estar antes de abrir a usuarios. Sigue abierta la pregunta de si el *share-alike* de los datos alcanza a los pesos entrenados con ellos; es parte de la decisión 7 (legal) del índice.

**BE-11** sale de la deuda de DEP-12 (`propuestas/2026-10-21-fotos-r2.md`, «La regla de §4.5…»): `ReporteService#crear` sube la foto a R2 **dentro** de su `@Transactional` y retiene una conexión del pool durante la red (~100–500 ms). La propuesta sugería resolverla con NC-04; NC-04 no la tomó (revisión del 25/10) y queda como tarea propia del S7. Va junto con borrar el objeto huérfano en `afterCompletion` cuando la transacción se revierte.

El sprint «Despliegue» se intercaló el 21/10 por decisión del usuario, así que S6 y S7 se corren una versión (y el 25/10 se intercambian, ver arriba). v0.7.0 es el MVP listo para desplegar: el primer despliegue (DEP-09) y su prueba de humo (DEP-10) esperan las cuentas del usuario, y lo que exijan corregir sale como hotfix `v0.7.x`. El sistema visual y US-23 del S8 se adelantaron en ese sprint con la dirección «Cívica» (`docs/diseno/`); en el S8 quedan la fase 2 del rediseño y US-24.

Ya hechas antes de S1: BE-01, BE-02, BE-07, FE-01 y FE-02.

## Decisiones del usuario que bloquean sprints

| Antes de | Decisión |
|---|---|
| S5 | US-19: el Gherkin del PDF (pegarlo en `backlog/product_backlog.md`). |
| S5 | D-10: jurisdicción del funcionario (`distrito_id` o `municipalidad_id`) y las fechas exactas del periodo 2023-2026. |
| S6 | Fórmulas de los KPIs por periodo; requisitos de recepción por municipalidad (NC-05). |
| S7 | Clases finales del modelo y umbral (NC-03): **decidido el 21/10** (`propuestas/2026-10-21-ml-clases-modelo.md`: `bache` y `grieta` de RDD2022, umbral 0,50). NC-04 arranca con un adaptador falso. |

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
- **Despliegue (2026-10-21/22, v0.7.0):** sprint intercalado para dejar el MVP listo para Railway, Vercel, R2 y Resend (decisiones del usuario del 21/10).
  - **Equipo y CI:** agentes del equipo (#83) y CI con el check `ci` obligatorio (#84, #88).
  - **Propuestas** (#87): despliegue, correo, R2 y ML, aceptadas; la de §4.3 sigue abierta.
  - **Configuración de producción e imagen** (#89), con el runbook (#87, #91).
  - **PWA instalable** (#85) y foto de perfil validada (#99).
  - **QA-1 sobre v0.6.0** (#88: 0 bloqueantes, 5 importantes), con correcciones en la PWA (#92) y en el backend (#100, con V18 y SEC-04).
  - **Primer ADMIN** (#93).
  - **Fotos en R2** (#96) y **correo con Resend** (#98).
  - **Diseño «Cívica»:** elegido (#90); su fase 1, con US-23, en #95.
  - **«Reportes que apoyas»** (#101) y diagramas (#102).
  - **Propuestas nuevas:** tildes (#94), aceptada; refresco asíncrono del índice (#97), abierta.
  - **Cifras:**
    - Failsafe 309 → 418, Surefire 62 → 230, ArchUnit 0 → 0;
    - frontend 646 → 1015 tests (83 → 118 archivos), avisos de capas 0.
  - **Imagen del backend:** probada con `prod` contra un PostGIS vacío y S3Mock: V1–V18 y health UP en 9 s.
  - **Pendiente:** el primer despliegue (DEP-09) y su prueba de humo (DEP-10) esperan las cuentas del usuario y un dominio verificado para Resend. El usuario pidió cortar v0.7.0 antes de desplegar (22/10).
  - **Siguen abiertos:** D-10, las fórmulas de los KPIs, las columnas de OB2, el Gherkin de US-19, los `[COMPLETAR]` legales, §4.3 y el pool del índice (#97).

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Qué es

Monorepo de la tesis UPC **ViaSegura**: crowdsourcing geoespacial de daños viales en Lima Metropolitana. El ciudadano reporta con foto + GPS, el reporte se asigna automáticamente al distrito por punto-en-polígono, y la municipalidad lo gestiona; un índice público mide el desempeño de cada distrito.

- `backend/` — Spring Boot 3.4, Java 21, PostgreSQL 16 + PostGIS 3.4, Hibernate Spatial, Flyway, JWT stateless.
- `frontend/` — PWA Next.js 16 (App Router, Turbopack), React 19, TS estricto, Tailwind 4, Serwist, Leaflet.
- `project-context/` — contexto de diseño, sin código: `backlog/product_backlog.md` define las historias **US-01..US-30** que se citan en commits, javadoc, tests y READMEs.

Todo el código, comentarios, commits y docs están en **español**. Los commits se titulan por historia (`US-27 y US-30: ...`).

`backend/README.md` y `frontend/README.md` registran las decisiones de diseño con su justificación (sustentación ante jurado). Antes de cambiar algo que parezca raro, revisar si está justificado ahí — muchas asimetrías son deliberadas.

## Arquitectura en capas (obligatorio)

`ARCHITECTURE.md` es la norma de capas para `backend/`, `frontend/` y `inferencia/`: las mismas cuatro capas (presentación, aplicación, dominio, infraestructura), qué va en cada subpaquete o carpeta, qué puede depender de qué y dónde vive cada módulo nuevo. **Leerlo antes de crear un archivo nuevo.** Lo hacen cumplir `ArquitecturaCapasTest` (ArchUnit, backend) y `eslint.capas.mjs` (frontend). La migración del código existente está en `project-context/decisions/plan-migracion-capas.md` (tareas `ARQ BE-xx` / `ARQ FE-xx`).

- Cada agente modifica solo su carpeta. `ARCHITECTURE.md` y `project-context/` no se editan sin pedido explícito: una duda de diseño se propone en `project-context/decisions/`.
- Ante un cambio de contrato, primero el backend (DTO + commit), después el frontend (`npm run api:sync`).

## Workflow de agentes (obligatorio)

`WORKFLOW.md` define roles, el ciclo de una tarea y las guardas. Resumen:

- Una sesión = una carpeta = una tarea = una rama. **GitFlow**: cada tarea es una `feature/<id>` que sale de `develop` y vuelve por PR a `develop`; `main` solo recibe versiones (`release/*`, `hotfix/*`) etiquetadas `vX.Y.Z`. Nunca se trabaja en `main` ni en `develop` (ambas protegidas en GitHub) y nunca se usa `git flow … finish`.
- Los commits no llevan línea `Co-Authored-By` (decisión del usuario).
- `/tarea <ID>` lleva una tarea del plan hasta el PR; `/verificar` mide la definición de terminado; `/revisar` pide revisión al subagente `revisor-arquitectura`; `/contrato` coordina cambios de API con un handoff escrito; `/propuesta` registra una duda de diseño en vez de resolverla.
- El hook `.claude/hooks/guardia.mjs` bloquea escribir fuera de la carpeta propia, editar normas, generados o migraciones existentes, y operaciones git peligrosas. Si bloquea algo legítimo, dilo al usuario: no lo esquives con comandos de shell.
- El PR lo fusiona el usuario.


### Backend (`backend/`)

El `mvn` global de esta máquina usa JDK 8 y no compila. Exportar antes:
`export JAVA_HOME="C:/Cursos/SpringCloudKubernetes/jdk-21.0.2"`

El puerto 5432 está ocupado por otro Postgres: usar **5433**.

```bash
POSTGRES_PORT=5433 docker compose up -d          # PostGIS (+ Mailhog: SMTP 1025, UI 8025)
POSTGRES_PORT=5433 mvn spring-boot:run           # API en :8080, Swagger en /swagger-ui.html
mvn clean verify                                 # todos los tests + JaCoCo (target/site/jacoco)
mvn verify -Dit.test=GestionMunicipalIT          # un solo test de integración
mvn test -Dtest=ReincidenciaDetectorTest         # un solo unit test
```

- Los tests de integración son `*IT` y corren con **Failsafe** (`mvn verify`), no con `mvn test`. Solo los `*Test` puros corren en Surefire.
- **Testcontainers no funciona aquí** (Docker 29). Los IT usan la BD persistente `viasegura_test` en el mismo contenedor (`viasegura-db`:5433), configurada en `support/AbstractPostgisIT` (override con `TEST_DB_URL`). Crearla una vez: `docker exec viasegura-db psql -U viasegura -d viasegura -c "CREATE DATABASE viasegura_test;"`.
- Al reportar resultados, citar el conteo de `target/failsafe-reports/failsafe-summary.xml` (`completed`), no solo `BUILD SUCCESS` — un `-Dit.test` mal escrito pasa sin ejecutar nada. Medir cobertura siempre sobre `clean verify`.
- Para reiniciar la app, matar el proceso por puerto 8080; matar Maven deja vivo el java hijo.

### Frontend (`frontend/`)

```bash
npm run dev                  # :3000 (SW desactivado en dev)
npm run build                # next build + serwist build serwist.config.mjs
npm run lint
npm run typecheck            # next typegen && tsc --noEmit (funciona en un checkout limpio)
npm test                     # vitest + scripts/verificar-tests.mjs (falla si algún *.test.ts(x) no se ejecutó)
npm run test:rapido          # vitest pelado, para iterar
npx vitest run src/features/reportes/model/acciones.test.ts   # un solo archivo
npm run api:sync             # baja /v3/api-docs del backend corriendo y regenera los tipos
```

- `frontend/CLAUDE.md` → `AGENTS.md`: **Next 16 tiene cambios incompatibles con lo conocido**; leer la guía en `frontend/node_modules/next/dist/docs/` antes de escribir código de Next. (`middleware` ahora es `proxy`; `params`/`searchParams`/`cookies()`/`headers()` son async.)
- `PageProps<'/ruta/[id]'>` no existe sin `.next/`; tipar `params: Promise<{ id: string }>` explícitamente.
- Si `npm run start` quedó corriendo de otra sesión, sirve el build viejo: matar el puerto 3000 antes de verificar.

## Arquitectura del backend

Paquete `pe.edu.upc.viasegura`, un paquete por dominio (`auth`, `distritos`, `reportes`, `notificaciones`, `desempeno`, `soporte`, más `common`), cada uno con `controller/ service/ repository/ dto/ domain/`. Los DTOs nunca son entidades.

Flujo central y piezas que cruzan dominios:

- **Asignación de distrito**: `POST /api/reportes` resuelve el distrito con `GeoAssignmentStrategy` → `PointInPolygonAssignmentStrategy` (`ST_Covers` sobre geography, índice GiST). Fuera de Lima → 409. Los 43 distritos los carga `DistritoSeeder` (ApplicationRunner idempotente) desde `resources/data/distritos_lima.geojson`, no una migración.
- **Deduplicación (US-09)**: antes de crear, se busca un reporte activo de la misma categoría a ≤20 m; si existe, se registra una adhesión en lugar de un reporte nuevo. El creador también tiene fila en `adhesion_reporte`.
- **Idempotencia (US-06)**: header opcional `Idempotency-Key`, tabla `idempotency_key` escopada por (clave, usuario); se resuelve *antes* de la deduplicación. No confundir con el 409 de US-09.
- **Máquina de estados** en `EstadoReporte.puedeTransicionarA` (PENDIENTE→RECIBIDO→EN_PROCESO→RESUELTO, RECHAZADO desde cualquiera no terminal; CANCELADO solo desde PENDIENTE y solo por el creador). Unidireccional porque alimenta métricas.
- **Línea de tiempo única**: `historial_estado_reporte` guarda cambios de estado y asignaciones (`tipo_evento` CAMBIO_ESTADO | ASIGNACION). Al ciudadano se le redacta el detalle interno en el servidor.
- **Eventos (Observer)**: `GestionReporteService` publica `ReporteEstadoCambiadoEvent`; listeners `@TransactionalEventListener(AFTER_COMMIT)` disparan notificaciones (`NotificacionService`, Strategy por canal: email real, push es stub que cae a email) y el `REFRESH MATERIALIZED VIEW CONCURRENTLY` de `mv_indice_desempeno_distrital` (`IndiceDesempenoRefreshListener`). Correos de seguridad/soporte usan `JavaMailSender` directo, no ese pipeline.
- **Autorización** en dos capas: `SecurityConfig` (rutas públicas **exactas**, nunca wildcards; solo `GET`) + `@PreAuthorize` por rol (CIUDADANO, FUNCIONARIO_MUNICIPAL, ADMIN) + chequeos de relación en el servicio (jurisdicción del funcionario = `Usuario.distrito`; creador/adherido). Denegación → `AccessDeniedException` → 403.
- **Convención de errores**: precondición de estado/negocio → 409 (`BusinessException`), validación → 400, falta de relación/rol → 403.
- **Fotos**: de reporte públicas en `/media/fotos/reportes/**`; de perfil solo al dueño vía `/api/perfiles/fotos/{uuid}` (requiere `Authorization`). `fotoUrl` se devuelve relativa.

### Base de datos

- Esquema solo por Flyway (`db/migration/V*__*.sql`); Hibernate en `ddl-auto: validate`, así que toda entidad nueva necesita su migración. No editar migraciones ya aplicadas.
- Queries con filtros opcionales: el patrón `(:param IS NULL OR ...)` falla en Postgres cuando el parámetro no tiene otro contexto tipado (pasó en nativas y JPQL). Usar `CAST(:param AS tipo) IS NULL` o, mejor, queries derivadas separadas combinadas en el servicio. En queries nativas paginadas, no pasar el `Sort` del `Pageable` (usa nombres de propiedad Java como columnas).

### Tests de integración

Extienden `support/AbstractPostgisIT` (MockMvc + BD `viasegura_test`), o `AbstractPostgisMailIT` si el flujo envía correo (GreenMail embebido en 3025). La BD es persistente y compartida entre clases: `AbstractPostgisIT.limpiezaFkSafe()` borra las tablas dependientes de `reporte` en orden de FK. **Toda tabla nueva con FK a `reporte` debe agregarse a esa limpieza**. `categoria_dano` y `usuario` no se limpian, así que los tests afirman pertenencia/invariantes, no conteos de esas tablas. Para fijar `updated_at`/`expires_at` en el pasado se usa `JdbcTemplate` directo.

## Arquitectura del frontend

- `src/app/` solo enruta y compone, en grupos por audiencia: `(public)`, `(auth)`, `(ciudadano)`, `(municipal)`, `(cuenta)` (cualquier usuario con sesión, p. ej. `/soporte`) y `(admin)` (área del ADMIN bajo `/admin/…`; dos grupos no pueden resolver a la misma URL). La lógica vive en `src/features/<dominio>/`; ningún componente de `app/` llama al API directamente, pasa por `features/<dominio>/api.ts`.
- `src/lib/api/client.ts`: wrapper de `fetch` nativo (`apiFetch`, `urlDeFoto`, `fotoRequiereAuth`, `comoBlob`). La foto de perfil se trae con `apiFetch` y se muestra como `blob:` porque `<img src>` no envía el token.
- Tipos: `src/lib/api/generated/schema.ts` es generado (**no editar**). springdoc marca casi todo campo como opcional y los enums como `string`; los tipos reales con uniones literales están en `src/lib/types/domain.ts`. El API envía `null` (no `undefined`) y `null` ≠ 0 en métricas ("Sin datos").
- JWT en `localStorage`, tocado solo por `src/lib/auth/token-storage.ts`; la mitigación es la CSP estricta de `next.config.ts` (al añadir un origen externo, como tiles de mapa, hay que listarlo ahí).
- `GuardiaDeRol` y `transiciones.ts`/`acciones.ts` son ayudas de UX que duplican reglas del backend a propósito; el backend sigue siendo la autoridad.
- Leaflet está encapsulado en `src/map/` (cargado con `dynamic(..., { ssr: false })`); el resto de la app solo maneja `{latitud, longitud}`. No se testea Leaflet en jsdom: los tests cubren lógica pura y componentes sin mapa.
- Vitest: `pool: 'threads'` y `fileParallelism: false` son necesarios en este Windows; `vitest.setup.ts` hace `afterEach(cleanup)` explícito.
- Service Worker con Serwist en modo CLI (`serwist.config.mjs`), no el plugin de Next, porque el plugin inyecta config de webpack y rompe con Turbopack.

## Reglas del proyecto

- **Ningún flag o señal operativa (detecciones, priorización, marcas internas) en un DTO que pueda leer quien solo consulta**: revisar campo por campo, no solo la ruta. Lo relativo al espectador ("¿ya califiqué?") va en endpoint propio.
- Un actor no debe poder manipular las métricas que miden su propio desempeño (ver SEC-01 en `backend/README.md`).

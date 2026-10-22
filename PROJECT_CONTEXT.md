# PROJECT_CONTEXT — Ciudad Viva

> Contexto para que una IA sin conocimiento previo pueda trabajar en este repositorio.
> Derivado del código real a fecha 2026-10-03. Lo marcado **(no verificado)** no se comprobó en código.
> Para más profundidad: `CLAUDE.md` (raíz), `backend/CLAUDE.md`, `frontend/CLAUDE.md`, `backend/README.md`, `frontend/README.md`.

## 1. Propósito

Ciudad Viva es la tesis UPC *"Sistema de crowdsourcing geoespacial para el reporte ciudadano y la gestión municipal de infraestructura vial en Lima Metropolitana"*. El ciudadano reporta un daño vial con foto y GPS, y el sistema lo asigna automáticamente a uno de los 43 distritos de Lima por punto-en-polígono. Luego la municipalidad lo gestiona (estados, responsable, historial) y un índice público compara el desempeño de cada distrito.

Usuarios: ciudadanos (`CIUDADANO`), funcionarios municipales (`FUNCIONARIO_MUNICIPAL`, ligados a un distrito), administradores (`ADMIN`) y el público anónimo (mapa e índice).

## 2. Stack técnico

| Capa | Tecnología (versión) |
|---|---|
| Backend | Java 21 · Spring Boot 3.4.4 (web, data-jpa, security, validation, mail) · Hibernate Spatial · Flyway (+ `flyway-database-postgresql`) · jjwt 0.12.6 · springdoc-openapi 2.8.5 · Apache POI 5.3.0 (export Excel) · Lombok |
| Tests backend | JUnit 5 / spring-boot-starter-test · spring-security-test · GreenMail 2.0.1 · JaCoCo 0.8.12 · Failsafe para `*IT` |
| Base de datos | PostgreSQL 16 + PostGIS 3.4 (imagen `postgis/postgis:16-3.4`) |
| Frontend | Next.js 16.3.3 (App Router, Turbopack) · React 19.2.8 · TypeScript 5 (estricto) · Tailwind CSS 4 · Serwist 9.5 (Service Worker, modo CLI) · Leaflet 1.9 + react-leaflet 5 · openapi-typescript 7.13 |
| Tests frontend | Vitest 4.1 · jsdom 30 · Testing Library (react 16, user-event 14, jest-dom) |
| Infra local | Docker Compose: `viasegura-db` (PostGIS) + `viasegura-mailhog` (SMTP de demo) |

Idioma: **todo en español** (código, comentarios, commits, UI, docs).

## 3. Estructura de carpetas

```
tesis/
├── CLAUDE.md                 # guía general del monorepo para agentes
├── backend/                  # API REST Spring Boot
│   ├── docker-compose.yml    # PostGIS + Mailhog
│   ├── pom.xml
│   ├── uploads/fotos/        # fotos subidas (filesystem local, runtime)
│   └── src/main/
│       ├── java/pe/edu/upc/viasegura/
│       │   ├── auth/         # registro, login, JWT, perfil, reset de password, foto de perfil
│       │   ├── distritos/    # distritos + seeder del GeoJSON + resolución por coordenadas
│       │   ├── reportes/     # núcleo: reportes, categorías, gestión, calificaciones, comentarios, export, idempotencia
│       │   │   ├── geo/      # Strategy de asignación de distrito (ST_Covers)
│       │   │   ├── event/    # eventos de dominio (creado, estado cambiado, categoría cambiada, calificación)
│       │   │   └── storage/  # FotoStorageService → LocalFotoStorageService
│       │   ├── notificaciones/ # listener de eventos + adapters por canal (email real, push stub)
│       │   ├── desempeno/    # índice público (vista materializada) + refresh por eventos
│       │   ├── soporte/      # tickets de soporte
│       │   └── common/       # security, exception handler, geo (lector GeoJSON), config
│       └── resources/
│           ├── application.yml (+ -local, -dev)
│           ├── db/migration/ # Flyway V1..V11
│           └── data/distritos_lima.geojson
├── frontend/                 # PWA Next.js
│   ├── next.config.ts        # CSP estricta
│   ├── serwist.config.mjs    # build del Service Worker
│   ├── scripts/verificar-tests.mjs # guarda: falla si algún test no se ejecutó
│   └── src/
│       ├── app/              # solo routing/composición: (public) (auth) (ciudadano) (municipal), sesion/
│       ├── features/<dominio>/ # lógica + api.ts por dominio: auth, reportes, gestion, desempeno, distritos, soporte
│       ├── lib/api/          # client.ts (fetch wrapper), errors.ts, openapi.json, generated/schema.ts
│       ├── lib/auth/         # token-storage.ts (único que toca el JWT)
│       ├── lib/types/domain.ts # tipos reales (uniones literales, nulabilidad)
│       ├── map/              # Leaflet encapsulado (MapaReportes, MapaSelectorUbicacion)
│       ├── components/       # UI compartida (form.tsx, LineaDeTiempo.tsx)
│       └── pwa/              # sw.ts + ProveedorPwa
└── project-context/          # sin código: backlog (US-01..US-30), contexto TOML, benchmarking del stack
```

## 4. Arquitectura y flujo de datos

```
Navegador (PWA Next.js :3000)
   │  fetch + Authorization: Bearer <JWT>   (CORS: solo localhost:3000 por defecto)
   ▼
Spring Boot API (:8080)  ──JPA/Hibernate Spatial──►  PostgreSQL+PostGIS (:5433 en esta máquina)
   │                                                   └─ mv_indice_desempeno_distrital (vista materializada)
   ├─ filesystem ./uploads/fotos (fotos)
   └─ SMTP (Mailhog en dev / GreenMail en tests) para notificaciones y correos de seguridad
```

- **Paquetes por dominio** con capas `controller → service → repository`, más `dto/` separado de `domain/` (las entidades nunca salen por la API).
- **Crear reporte** (`POST /api/reportes`, multipart, rol CIUDADANO):
  1. Si viene el header `Idempotency-Key`, se resuelve primero (`IdempotencyKeyService`, US-06) y una repetición devuelve la respuesta guardada.
  2. Se asigna el distrito con `GeoAssignmentStrategy` → `PointInPolygonAssignmentStrategy` (`ST_Covers` sobre geography, índice GiST). Un punto fuera de Lima responde 409.
  3. Deduplicación (US-09): si hay un reporte activo de la misma categoría a ≤20 m, se registra una adhesión en lugar de un reporte nuevo.
  4. Se publica `ReporteCreado`.
- **Gestión municipal** (`GestionReporteController`: bandeja, cambio de estado, responsable, exportar):
  - La jurisdicción es `Usuario.distrito`.
  - Cada cambio queda en `historial_estado_reporte`, la línea de tiempo única con `tipo_evento` CAMBIO_ESTADO | ASIGNACION. El ciudadano la ve redactada.
- **Eventos de dominio** (`reportes/event`) consumidos con `@TransactionalEventListener(AFTER_COMMIT)`:
  - `IndiceDesempenoRefreshListener` ejecuta `REFRESH MATERIALIZED VIEW CONCURRENTLY`.
  - `ReporteEstadoCambiadoListener` → `NotificacionService` → adapters por canal. El email es real; el push es un stub que cae a email.
- **Seguridad**: JWT stateless (expira a los 120 min por defecto, sin blacklist; el logout es solo del cliente). La autorización tiene tres capas:
  1. `SecurityConfig`: rutas públicas exactas y solo GET, por ejemplo `/api/reportes/{id:[0-9]+}`.
  2. `@PreAuthorize` por rol.
  3. Chequeos de relación en el servicio (dueño, adherido, distrito del funcionario).
- **Frontend**:
  - `app/` compone y `features/<dominio>/api.ts` llama al API mediante `apiFetch`.
  - Los tipos se generan del OpenAPI del backend (`npm run api:sync`).
  - El mapa se carga con `dynamic(..., { ssr: false })`.

### Endpoints principales (prefijo `/api`)

| Área | Rutas |
|---|---|
| auth | `POST auth/registro`, `auth/login`, `auth/recuperar-password`, `auth/restablecer-password`; `GET/PATCH auth/me` (multipart), `PATCH auth/me/preferencia-notificacion`; `GET perfiles/fotos/{archivo}` (solo el dueño) |
| reportes (ciudadano/público) | `POST reportes`; `GET reportes` (público, paginado: `distritoId`, `categoriaId`, `estado`, `fechaDesde`, `fechaHasta` y bbox `minLat/minLon/maxLat/maxLon`); `GET reportes/{id}`; `PATCH/DELETE reportes/{id}` (editar/cancelar si está PENDIENTE); `GET reportes/mis-reportes`, `reportes/mis-reportes/pendientes-calificacion`; `GET reportes/{id}/historial`; `POST/GET reportes/{id}/calificacion`; `POST/GET reportes/{id}/comentarios` |
| gestión (funcionario) | `GET reportes/bandeja`, `GET reportes/exportar`, `PATCH reportes/{id}/estado`, `POST/GET reportes/{id}/responsable` |
| catálogos | `GET categorias`, `POST categorias` (funcionario, US-29); `GET distritos`, `GET distritos/por-coordenadas` |
| desempeño | `GET desempeno/distritos` (público), `GET desempeno/mi-distrito` (funcionario) |
| soporte | `POST soporte/tickets`, `GET soporte/tickets/mis-tickets`, `PATCH soporte/tickets/{id}/responder` (ADMIN) |

Swagger: `http://localhost:8080/swagger-ui.html` · spec: `/v3/api-docs`.

## 5. Archivos clave

| Archivo | Qué hace |
|---|---|
| `backend/.../common/security/SecurityConfig.java` | Filtro JWT, CORS, rutas públicas exactas, roles |
| `backend/.../common/exception/GlobalExceptionHandler.java` | Mapea las excepciones a HTTP (409/404/400/403) |
| `backend/.../reportes/service/ReporteService.java` | Creación de reportes: idempotencia, asignación geo, deduplicación/adhesión, edición/cancelación |
| `backend/.../reportes/geo/PointInPolygonAssignmentStrategy.java` | Resuelve el distrito con `ST_Covers` |
| `backend/.../reportes/domain/EstadoReporte.java` | Máquina de estados, separada por actor |
| `backend/.../reportes/service/GestionReporteService.java` | Bandeja, cambios de estado, asignación de responsable, publicación de eventos |
| `backend/.../reportes/service/IdempotencyKeyService.java` | US-06: deduplica reintentos por (clave, usuario) |
| `backend/.../reportes/service/ReincidenciaDetector.java` | Marca `posible_reincidencia` en comentarios por palabras clave (no NLP) |
| `backend/.../desempeno/listener/IndiceDesempenoRefreshListener.java` | Refresca la vista del índice público tras cada commit relevante |
| `backend/.../distritos/service/DistritoSeeder.java` | Carga idempotente de los 43 distritos desde el GeoJSON |
| `backend/src/main/resources/db/migration/V*.sql` | Esquema completo (fuente de verdad) |
| `backend/src/test/java/.../support/AbstractPostgisIT.java` | Base de los tests de integración: conexión a `viasegura_test` y limpieza en orden de FK |
| `frontend/src/lib/api/client.ts` | `apiFetch`: URL base, token, errores, 401 centralizado, fotos (`urlDeFoto`, `fotoRequiereAuth`) |
| `frontend/src/lib/types/domain.ts` | Tipos de dominio reales sobre el schema generado |
| `frontend/next.config.ts` | CSP estricta (`connect-src` del API, tiles de OSM en `img-src`) |
| `frontend/src/features/gestion/transiciones.ts` | Copia en el cliente de las transiciones válidas (solo UX) |

## 6. Modelo de datos

Flyway V1–V11. Hibernate corre con `ddl-auto: validate`. Ids `BIGINT IDENTITY` y timestamps `TIMESTAMPTZ`.

| Tabla | Campos relevantes |
|---|---|
| `distrito` | `nombre` (único), `ubigeo`, `limites geography(MultiPolygon,4326)` con GiST |
| `usuario` | `email` (único), `password_hash`, `nombre`, `apellido`, `rol` (CIUDADANO\|FUNCIONARIO_MUNICIPAL\|ADMIN), `distrito_id` (jurisdicción del funcionario), `preferencia_notificacion` (default AMBAS), `activo`, `foto_url` (V10) |
| `categoria_dano` | `nombre`, `descripcion`, `es_estandar`, `distrito_id` (las personalizadas por distrito, US-29), `activo`. V3 siembra 6 estándar |
| `reporte` | `ubicacion geography(Point,4326)` con GiST, `foto_url`, `descripcion`, `categoria_id`, `estado` (PENDIENTE\|RECIBIDO\|EN_PROCESO\|RESUELTO\|RECHAZADO\|CANCELADO, este último desde V7), `distrito_id`, `creador_id`, `total_adhesiones`, `resolved_at`, `posible_reincidencia` (V6, señal interna) |
| `adhesion_reporte` | (`reporte_id`, `usuario_id`) único; el creador también tiene fila |
| `historial_estado_reporte` | `estado_anterior`, `estado_nuevo` (nullable desde V4), `comentario`, `autor_id`, `tipo_evento` (CAMBIO_ESTADO\|ASIGNACION) con check de coherencia |
| `asignacion_responsable` | `responsable`, `notas`, `asignado_por_id`, `activo` |
| `calificacion` | `estrellas` 1–5, `comentario`; (`reporte_id`, `usuario_id`) único |
| `comentario_publico` | `contenido`, `posible_reincidencia` (señal interna) |
| `notificacion` | `tipo_evento`, `canal` (PUSH\|EMAIL), `estado_entrega` (PENDIENTE\|ENVIADA\|FALLIDA), `leida`, `sent_at` |
| `ticket_soporte` | `usuario_id` (nullable), `email_contacto`, `asunto`, `mensaje`, `estado` (ABIERTO\|EN_PROCESO\|CERRADO), `respuesta` (V9) |
| `password_reset_token` | `token` (único), `expires_at`, `used_at` |
| `idempotency_key` | (`clave`, `usuario_id`) único, `response_body`, `expires_at` |
| `mv_indice_desempeno_distrital` | Vista materializada (V2 y V5 la recrean). Una fila por distrito × categoría, más una fila agregada con id `'ALL'` (GROUPING). Contiene totales, resueltos, tiempo promedio y satisfacción (promedio de estrellas). Índice único `id`, necesario para `CONCURRENTLY` |

## 7. Cómo correrlo

**Requisitos**: JDK 21, Maven, Docker, Node (versión no fijada, **no verificado**).

Particularidades de la máquina actual:
- El `mvn` global usa JDK 8, así que hay que exportar `JAVA_HOME` a un JDK 21.
- El puerto 5432 está ocupado, así que se usa `POSTGRES_PORT=5433`.

```bash
# Backend (backend/)
POSTGRES_PORT=5433 docker compose up -d
docker exec viasegura-db psql -U viasegura -d viasegura -c "CREATE DATABASE viasegura_test;"  # una vez, para tests
POSTGRES_PORT=5433 mvn spring-boot:run        # perfil 'local' por defecto; Flyway migra y el seeder carga distritos
mvn clean verify                              # *Test (Surefire) + *IT (Failsafe) + JaCoCo
mvn verify -Dit.test=GestionMunicipalIT       # un IT
mvn test -Dtest=ReincidenciaDetectorTest      # un unit test

# Frontend (frontend/)
cp .env.example .env.local
npm install
npm run dev            # :3000, sin Service Worker
npm run build          # next build + serwist build
npm run lint && npm run typecheck
npm test               # vitest + guarda de completitud
npm run api:sync       # requiere el backend corriendo
```

**Variables de entorno** (solo nombres):
- Backend, perfil `local`: `POSTGRES_PORT`, `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `JWT_SECRET`, `JWT_EXPIRATION_MINUTES`, `MAIL_HOST`, `MAIL_PORT`, `MAIL_SMTP_AUTH`, `MAIL_SMTP_STARTTLS`, `NOTIF_FROM`, `FOTOS_DIR`, `CORS_ALLOWED_ORIGINS`.
- Backend, perfil `dev`: `DB_URL`, `DB_USERNAME`, `DB_PASSWORD`, `JWT_SECRET`. Se activa con `mvn spring-boot:run -Dspring-boot.run.profiles=dev` (desde DEP-01 el pom fija `local` para `spring-boot:run`, así que `SPRING_PROFILES_ACTIVE` ya no basta ahí); fuera de Maven, con `SPRING_PROFILES_ACTIVE=dev`.
- Backend, perfil `prod`: lo fija la imagen (`backend/Dockerfile`); variables en `docs/despliegue.md` §5.2. El secreto de desarrollo solo se acepta con `local` o `test` activos explícitamente.
- Tests backend: `TEST_DB_URL`, `TEST_DB_USER`, `TEST_DB_PASSWORD` (opcionales).
- Docker compose: `POSTGRES_*`, `MAILHOG_SMTP_PORT`, `MAILHOG_UI_PORT`.
- Frontend: `NEXT_PUBLIC_API_BASE_URL`.

## 8. Convenciones

- **Nombres en español** (`ReporteService`, `leerToken`, `urlDeFoto`). Los commits se titulan por historia: `US-27 y US-30: ...`. Javadoc y tests citan la `US-xx` y el escenario.
- **Errores**:
  - Precondición de negocio o estado → 409 (`BusinessException`).
  - Validación → 400.
  - Falta de rol o relación → 403.
  - Recurso inexistente → 404.
  - `AccessDeniedException` descarta el mensaje; si el texto le importa al cliente, usar `OperacionNoPermitidaException`.
- **Patrones**: Repository, Strategy (asignación geo y canales de notificación), Observer (eventos AFTER_COMMIT), DTOs como records.
- **Queries**:
  - Evitar `(:p IS NULL OR ...)`: usar `CAST(:p AS tipo) IS NULL` o queries derivadas separadas.
  - En nativas paginadas, no pasar el `Sort` del `Pageable`.
  - Las reglas de visibilidad se replican en `buscar` y en `buscarEnArea`.
- **Tests backend**:
  - Casi todos son `*IT` y extienden `AbstractPostgisIT` (o `AbstractPostgisMailIT`).
  - Afirman invariantes, no conteos de `usuario`/`categoria_dano`.
  - Al citar resultados, leer `completed` en `target/failsafe-reports/failsafe-summary.xml`.
- **Frontend**:
  - Lógica en `features/`; los componentes de `app/` no llaman al API directamente.
  - Tests solo de lógica pura y componentes sin mapa.
  - El API manda `null`, y `null` ≠ 0 en las métricas.
  - Formato numérico `es-PE`.
  - `params`/`searchParams` son `Promise` (Next 16).

## 9. Estado actual

Commits recientes: US-27/US-30 (comentarios, perfil), US-26 (calificación), US-07/08/22/26 (ciclo del ciudadano).

**Funciona end-to-end (backend + frontend):**
- US-01 registro, US-02 login.
- US-05 crear reporte (GPS o mapa, foto, idempotencia, adhesión).
- US-07 mis reportes, US-08 editar/cancelar, US-09 deduplicación.
- US-10 mapa público con filtros.
- US-13/14/15/22 bandeja municipal con estados, responsable e historial.
- US-18/19/20 índice de desempeño.
- US-26 calificación, US-27 comentarios, US-30 perfil y foto.

**Solo backend, sin pantalla en el frontend.** Las carpetas de ruta existen pero están vacías:
- US-03 recuperar contraseña: `app/(auth)/recuperar-password/` vacía.
- US-17 dashboard del distrito: `GET desempeno/mi-distrito` existe, `app/(municipal)/dashboard/` vacía.
- US-25 soporte: `features/soporte/` vacía.
- US-28 exportar a Excel: no hay UI encontrada.
- US-29 crear categorías personalizadas: el frontend solo las consume en el selector; UI de alta **(no verificado)**.

**A medias o pendiente:**
- US-06: la sincronización offline con cola en el Service Worker no está implementada. Hoy el formulario conserva la `Idempotency-Key` para el reintento manual.
- US-21: el push es un stub (`PushNotificacionAdapter`, `TODO(US-PWA/push-real)`) que cae a email.
- US-11: el mapa de calor está pospuesto (lo dicen los comentarios en `DistritoResponse`/`Reporte`).
- US-24: la guía de uso no existe (`app/(public)/guia/` vacía).
- US-23: hay clases `dark:` de Tailwind que siguen al sistema, pero no un selector de modo oscuro/alto contraste **(no verificado del todo)**.
- US-04: logout solo del cliente (no hay blacklist, por diseño). Hay botón "Cerrar sesión" en `/bandeja` y `/sesion`; no se verificó en las vistas del ciudadano.
- `app/sesion/` es andamiaje temporal de verificación de `/auth/me`.

**Deuda / bugs conocidos** (`backend/README.md`):
- Testcontainers no funciona con Docker 29; se usa la BD persistente `viasegura_test` como workaround.
- Las fotos están en filesystem local. Una transacción fallida deja archivos huérfanos.
- El dataset de distritos está simplificado (≈≤20 m de error en bordes).
- Un token robado sigue siendo válido hasta 120 min, incluso si el usuario cambia la contraseña.
- `backend/target-*.log` son logs sueltos de corridas anteriores (ruido, no código).

## 10. Advertencias (no romper)

1. **Migraciones Flyway ya aplicadas no se editan**: se crea una `V12__...` nueva. Toda entidad nueva necesita su migración (por `validate`).
2. **Toda tabla nueva con FK a `reporte`** debe agregarse a `AbstractPostgisIT.limpiezaFkSafe()`; si no, los tests dependen del orden.
3. **Toda operación que cambie `total_reportes`, `total_resueltos` o la satisfacción debe publicar un evento** que refresque `mv_indice_desempeno_distrital`. Ya hubo un bug por un disparador faltante.
4. **Señales internas** (`posible_reincidencia`, priorización) nunca van en DTOs que lea un ciudadano o el público. Revisar campo por campo. Lo relativo al espectador ("¿ya califiqué?") va en un endpoint propio.
5. **SEC-01**: ningún actor manipula las métricas de su propio desempeño. El funcionario no puede `CANCELAR`; solo el creador, desde PENDIENTE. Un estado nuevo debe asignarse explícitamente a un actor.
6. **Rutas públicas en `SecurityConfig`**: exactas y solo GET, nunca wildcards que abran rutas hermanas privadas.
7. **Idempotencia (US-06) ≠ deduplicación (US-09)**: la idempotencia se resuelve antes. No mezclarlas.
8. **Foto de perfil**: solo el dueño, vía `apiFetch` + `blob:` (un `<img src>` da 401). El controlador responde 404, no 403, si la foto no es del solicitante, y nunca lee el disco con el nombre de la URL.
9. **CSP en `next.config.ts`**: cualquier origen externo nuevo (API, tiles) debe listarse con hosts concretos.
10. **`generated/schema.ts` no se edita a mano**: los ajustes van en `lib/types/domain.ts`.
11. **Serwist en modo CLI**, no el plugin de Next: el plugin inyecta webpack y rompe con Turbopack.
12. **Vitest** necesita `pool: 'threads'`, `fileParallelism: false` y `afterEach(cleanup)` explícito en este Windows. `npm test` incluye una guarda que falla si un archivo de test no se ejecutó.
13. **`transiciones.ts` y `GuardiaDeRol`** duplican reglas del backend solo para UX. La autoridad es el backend (`EstadoReporte`), y la UI municipal nunca ofrece `CANCELADO`.
14. **Next 16** tiene APIs distintas a las conocidas (`proxy` en lugar de `middleware`, `params`/`cookies()` async). Leer `frontend/node_modules/next/dist/docs/` antes de escribir código de Next.

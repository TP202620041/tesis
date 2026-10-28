# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Backend de **Ciudad Viva** (tesis UPC: crowdsourcing geoespacial de daños viales en Lima). Spring Boot 3.4 · Java 21 · PostgreSQL 16 + PostGIS 3.4 · Hibernate Spatial · Flyway · JWT stateless. Es parte de un monorepo: `../frontend` (PWA Next.js, con su propio `CLAUDE.md`) consume esta API, y `../project-context` guarda el backlog (`backlog/product_backlog.md`, historias `US-xx`) y las decisiones de stack. El código, los comentarios, los commits y la documentación están en español: mantén ese idioma.

## Entorno (no obvio)

- El usuario trabaja en **Windows y en macOS**. Comprueba en cuál estás antes de correr Maven:
  - **Windows:** el `mvn` global usa JDK 8: `export JAVA_HOME="C:/Cursos/SpringCloudKubernetes/jdk-21.0.2"`. El 5432 lo ocupa otro Postgres, así que la BD corre en el **5433**: exporta `POSTGRES_PORT=5433` para `docker compose` y para la app (los IT ya apuntan a 5433).
  - **macOS:** el Java por defecto (24) no compila con el Lombok de Boot 3.4: `export JAVA_HOME=/opt/homebrew/opt/openjdk@21`. La BD corre en el **5432**: para los IT exporta `TEST_DB_URL=jdbc:postgresql://localhost:5432/viasegura_test`.
- Para reiniciar la app, matar `spring-boot:run` no libera el 8080 (sigue vivo el proceso java hijo). Hay que matar el proceso que escucha en el puerto: en Windows `Get-NetTCPConnection -LocalPort 8080` → `Stop-Process`; en macOS `lsof -ti tcp:8080 | xargs kill`.
- Para que la PWA de un worktree en :3001 hable con el API: `CORS_ALLOWED_ORIGINS=http://localhost:3000,http://localhost:3001`.
- Datos de prueba para la BD de desarrollo: `scripts/seed-datos-prueba.sql` (instrucciones en su cabecera).

## Comandos

```bash
[POSTGRES_PORT=5433] docker compose up -d      # PostGIS (5433 solo en Windows); (viasegura-db) + Mailhog (UI :8025, SMTP :1025)
[POSTGRES_PORT=5433] mvn spring-boot:run       # API en :8080, Swagger en /swagger-ui.html, perfil 'local'

# Una sola vez, para crear la base de test (mismo contenedor):
docker exec viasegura-db psql -U viasegura -d viasegura -c "CREATE DATABASE viasegura_test;"

mvn verify                                     # suite completa: *IT (Failsafe) + *Test (Surefire) + JaCoCo
mvn clean verify                               # obligatorio cuando se cita cobertura (un target/ sucio la distorsiona)
mvn verify -Dit.test=GestionMunicipalIT        # una clase IT
mvn verify -Dit.test='GestionMunicipalIT#metodo'             # un método IT
mvn test -Dtest=ReincidenciaDetectorTest       # un unit test puro (Surefire)
```

- Casi todos los tests son **de integración (`*IT`) y corren con Failsafe en `verify`**. `mvn test` no los ejecuta.
- **Verifica siempre cuántos tests se ejecutaron**, no solo que salga `BUILD SUCCESS`. Un `-Dit.test` mal escrito puede pasar sin correr nada. Lee `completed` en `target/failsafe-reports/failsafe-summary.xml` y desconfía de cualquier caída en el total. Los conteos y la cobertura se presentan como evidencia ante el jurado de la tesis.
- Cobertura: `target/site/jacoco/index.html` (o `jacoco.csv`).

## Infraestructura de tests

- **No se usa Testcontainers.** Docker 29 rompe al docker-java de Testcontainers 1.20.x. En su lugar, `support/AbstractPostgisIT` se conecta a la base persistente `viasegura_test` del contenedor de desarrollo (se puede sobrescribir con `TEST_DB_URL`/`TEST_DB_USER`/`TEST_DB_PASSWORD`). H2 no sirve porque no soporta `geography`, `ST_Covers` ni GiST.
- La base de test es **persistente y compartida entre clases**. `AbstractPostgisIT#limpiezaFkSafe` borra antes de cada test en orden inverso de FK: notificaciones, idempotency keys, historial, asignaciones, calificaciones, comentarios, adhesiones y, al final, reportes. **Si una tabla nueva referencia a `reporte`, agrégala a esa limpieza.** Si no lo haces, los tests empiezan a depender del orden en que corren las clases.
- Los distritos no se borran: el `DistritoSeeder` es idempotente y los deja cargados. Por eso su cobertura sale baja sin que sea un hueco real.
- Para correo, `AbstractPostgisMailIT` levanta GreenMail embebido. Mailhog solo se usa para la demo manual.
- `categoria_dano` tampoco se limpia: las categorías personalizadas se acumulan entre corridas. Afirma pertenencia e invariantes, no conteos exactos (las 6 estándar del seed V3 sí son estables).
- La limpieza **no refresca la vista materializada** de desempeño. Los tests que leen el índice la refrescan en su propio `@BeforeEach` (`DesempenoService.refrescarIndice()`), o heredan en silencio los conteos del test anterior.
- Para dejar `updated_at` o `expires_at` en el pasado, usa `JdbcTemplate`: el auditing de JPA los sobrescribe en cada `save`.

## Capas (obligatorio — ver `../ARCHITECTURE.md` §4)

Cada módulo usa **solo** estos subpaquetes; no crear otros (`geo/`, `storage/`, `adapter/`, `util/`…):

| Subpaquete | Capa | Contiene |
|---|---|---|
| `controller/` | Presentación | `@RestController` delgado: valida, delega en un servicio. |
| `dto/` | Contratos | Solo `*Request` / `*Response` (+ enums de parámetros). |
| `service/` | Aplicación | Casos de uso `@Transactional`, autorización por instancia, eventos, `*Command`. |
| `listener/` | Aplicación | `@TransactionalEventListener(AFTER_COMMIT)`. |
| `domain/` | Dominio | `@Entity`, enums, máquinas de estado, reglas puras. |
| `event/` | Dominio | `*Event` publicados por el módulo. |
| `port/` | Dominio | Interfaces hacia I/O externo (fotos, SMTP, IA, geo). |
| `repository/` | Persistencia | Spring Data `*Repository`. |
| `infra/` | Adaptadores | Implementaciones de `port/`, seeders, clientes HTTP, POI. |

- De **otro** módulo solo se usa `service`, `domain`, `event`, `port` o `dto`; nunca su `controller`, `listener`, `repository` ni `infra`.
- `ArquitecturaCapasTest` (`mvn test -Dtest=ArquitecturaCapasTest`) lo verifica. Las violaciones previas están congeladas en `src/test/resources/archunit_store`: una violación **nueva** hace fallar el build; el almacén solo puede achicarse. No editar el almacén a mano ni relajar una regla para que pase.
- Mientras dure la migración (`../project-context/decisions/plan-migracion-capas.md`), la descripción de abajo refleja el código actual; donde difiera, manda `ARCHITECTURE.md`.

## Arquitectura

Paquete base `pe.edu.upc.viasegura`, organizado **por dominio**: `auth`, `distritos`, `municipalidades`, `clasificacion`, `reportes`, `notificaciones`, `desempeno` y `soporte`, más `common` (seguridad, excepciones, geo y configuración). Cada dominio sigue `controller/ → service/ → repository/` y separa `dto/` de `domain/`, porque los DTO nunca exponen entidades JPA.

- **Esquema:** lo administra Flyway (`src/main/resources/db/migration/V*.sql`). Hibernate corre con `ddl-auto: validate`, así que cada cambio de entidad necesita una migración nueva. Nunca se edita una migración ya aplicada.
- **Geoespacial:** `reporte.ubicacion` es `GEOGRAPHY(Point,4326)` y `distrito.limites` es `GEOGRAPHY(MultiPolygon,4326)`, ambos con índice GiST. El distrito se asigna con el Strategy `distritos/port/GeoAssignmentStrategy` → `distritos/infra/PointInPolygonAssignmentStrategy`, que usa `ST_Covers`. Un punto fuera de Lima recibe 409. Los 43 distritos se cargan desde `resources/data/distritos_lima.geojson` con `distritos/infra/DistritoSeeder` (un ApplicationRunner) y `common/geo/GeoJsonMultiPolygonReader`.
- **Eventos de dominio** (`reportes/event/`): los servicios publican `ReporteCreado`, `ReporteEstadoCambiado`, `ReporteCategoriaCambiada` y `CalificacionRegistrada`. Los consumen listeners `@TransactionalEventListener(AFTER_COMMIT)`:
  - `desempeno/listener/IndiceDesempenoRefreshListener` ejecuta `REFRESH MATERIALIZED VIEW CONCURRENTLY` sobre `mv_indice_desempeno_distrital`, de donde sale el índice público de desempeño. Cualquier operación nueva que cambie `total_reportes` (el denominador), `total_resueltos` o la satisfacción **debe publicar un evento que refresque la vista**. Que falte un disparador ya fue un bug real.
  - `notificaciones/listener/ReporteEstadoCambiadoListener` envía notificaciones por canal con adapters (`notificaciones/port/NotificacionCanalAdapter`, implementado en `notificaciones/infra/`: push y email).
- **Máquina de estados de `EstadoReporte`, separada por actor:** `transicionesDeGestionMunicipal()` no incluye nunca `CANCELADO`. La única vía a `CANCELADO` es `elCreadorPuedeCancelar()`, desde `PENDIENTE` y solo para el ciudadano creador. Un estado nuevo debe asignarse explícitamente a un actor (ver SEC-01 en el README).
- **Seguridad** (`common/security/SecurityConfig`): JWT stateless, sin blacklist (el logout es solo del lado del cliente, y es deliberado). Hay tres roles: `CIUDADANO`, `FUNCIONARIO_MUNICIPAL` y `ADMIN`. Las rutas públicas se declaran con **rutas exactas y método GET**, nunca con wildcards que abran rutas hermanas privadas (`/api/reportes/{id:[0-9]+}` en lugar de `/api/reportes/*`). La autorización por instancia (dueño o distrito del funcionario) vive en los servicios, no en `SecurityConfig`. `OperacionNoPermitidaException` produce un 403 que conserva el mensaje.
- **Fotos:** `common/port/FotoStorageService` (vive en `common` porque lo usan `auth` y `reportes`, D-11) tiene dos adaptadores elegidos por `app.storage.tipo` (`FOTOS_ALMACEN`, DEP-12): `common/infra/LocalFotoStorageService` (`local`, por defecto y fijo en los tests, en `./uploads/fotos`) y `common/infra/S3FotoStorageService` (`s3`: Cloudflare R2 en producción, dos buckets privados). Toda foto pasa antes por `common/port/SaneadorDeImagen` (`ImageIoSaneadorDeImagen`): JPEG sin EXIF, orientado, ≤ 2048 px, con un semáforo de saneados simultáneos (503 sin turno). Las de reporte son públicas en `/media/fotos/reportes/…` (resource handler de `WebMvcConfig` que lee por el puerto). Las de perfil solo las ve su dueño, a través de `PerfilFotoController`. Ese controlador nunca lee el almacenamiento con el nombre que llega en la URL, y si la foto no es del solicitante responde 404 en vez de 403. Las fotos de los tests deben ser imágenes reales (`support/ImagenesDePrueba`). `S3FotoStorageServiceIT` solo corre si existe `FOTOS_S3_TEST_ENDPOINT` (Adobe S3Mock, ver README).
- **Correo (DEP-08):** todo correo sale por `common/port/CorreoSaliente`: `common/infra/SmtpCorreoAdapter` en local y en los IT (Mailhog, GreenMail) y `ResendCorreoAdapter` (API HTTP) en producción, según `app.correo.tipo`. Nunca `JavaMailSender` fuera del adaptador SMTP (`CorreoSoloPorElPuertoTest`). Un correo que nace de una operación se envía **después del commit** y fuera de la transacción: el servicio publica un evento con el id, y un listener encola en el executor de `AsyncConfig`, pide el mensaje al servicio y lo envía (ver «Correo saliente» en el README).
- **Sugerencia de categoría (NC-04):** `clasificacion/port/ClasificadorDano` (por `app.clasificacion.tipo`: `infra/InferenciaHttpAdapter` con `http`, el servicio `inferencia/` en `CLASIFICACION_URL`, HTTP/1.1, 3 s y a lo sumo 4 llamadas a la vez, obligatorio en `prod` desde NC-04b; `infra/FalsoClasificadorAdapter` con `falso`, en local y en los tests), `domain/PoliticaDeSugerencia` y `POST /api/clasificaciones` (vista previa: sanea la foto como el almacenamiento, con un turno propio que no espera para no competir con las subidas, y **no guarda nada**; un error del clasificador o la falta de turno dan «sin sugerencia», nunca un error). Si el adaptador no `estaDisponible()` (el falso sin respuesta: `CLASIFICACION_TIPO=falso` en `prod` es el interruptor), ni la vista previa sanea ni la sugerencia oficial descarga la foto. La sugerencia oficial la escribe `reportes/listener/SugerenciaCategoriaListener` → `SugerenciaCategoriaService` (`@Async(AsyncConfig.EJECUTOR_SUGERENCIAS)`, su propio executor de 2 hilos, sin transacción) → `ReporteService#registrarSugerencia`. Desde NC-04c el puerto recibe un `OrigenDeConsulta`: la vista previa no espera turno y la sugerencia oficial lo espera hasta 10 s (`CLASIFICACION_ESPERA_TURNO_MS`); por eso va en un executor aparte, para no retrasar correos ni avisos. El registro es un `UPDATE` que solo escribe si las tres columnas siguen nulas. Esas columnas son de solo lectura para JPA en `Reporte` y son una señal interna: **ningún DTO** las expone (`SugerenciaFueraDeDtosIT`). Las categorías clasificables llegan por `clasificacion/port/CategoriasClasificables`, que implementa `reportes/infra/JpaCategoriasClasificablesAdapter` (si `clasificacion` llamara a `reportes` habría un ciclo). En los IT el falso detecta `bache:0.87,grieta:0.30` en cualquier foto (`application-test.yml`); `SugerenciaCategoriaFallaIT` lo pone en `falla`. `InferenciaHttpAdapterIT` (el contenedor real) solo corre si existe `CLASIFICACION_TEST_URL`.
- **Idempotencia (US-06):** `POST /api/reportes` acepta el header `Idempotency-Key`. Se resuelve en `IdempotencyKeyService` (tabla `idempotency_key`) **antes** de la deduplicación por acumulación (US-09, adhesión o 409). Son dos mecanismos distintos y no deben mezclarse.
- **Trazabilidad:** `historial_estado_reporte` es la línea de tiempo única de la gestión. Usa `tipo_evento` (`CAMBIO_ESTADO` | `ASIGNACION`), y en las asignaciones los estados son `NULL`. Al ciudadano se le muestra redactada; al funcionario, completa.
- **Códigos de error** (`common/exception/GlobalExceptionHandler`): `BusinessException` → 409, la convención para una precondición de estado no cumplida. `ResourceNotFoundException` → 404. Las validaciones de Bean Validation → 400. `AccessDeniedException` → 403 con un "Acceso denegado" fijo que **descarta el mensaje** (si el texto le importa al cliente, usa `OperacionNoPermitidaException`).

### Trampas de JPA/Postgres ya pisadas

- Si un parámetro opcional solo aparece en `(:p IS NULL OR ...)`, Postgres responde *"could not determine data type of parameter"*. Pasa en consultas nativas y también en JPQL con `Instant`. Usa `CAST(:p AS tipo) IS NULL`, queries derivadas o métodos de repositorio separados (como `buscar` / `buscarEnArea`).
- En queries **nativas** paginadas, Spring Data agrega al `ORDER BY` los nombres de propiedad Java (`createdAt`) en vez de los de columna. Descarta el `Sort` del `Pageable` (`PageRequest.of(page, size)`) y deja el `ORDER BY` fijo en el SQL.
- Una regla de visibilidad que se aplica en `buscar` también debe aplicarse en `buscarEnArea`, porque son métodos distintos (por ejemplo, excluir `CANCELADO` de la búsqueda pública).

## Reglas del proyecto

- **Ninguna señal interna va en un DTO público.** Los flags de detección, puntajes y marcas de priorización (por ejemplo `posibleReincidencia`) solo los ve quien actúa sobre el dato. Revísalo **por campo**, no solo por ruta. Los datos que dependen de quien consulta ("¿yo ya califiqué?") van en un endpoint propio, nunca en un DTO compartido con contextos anónimos.
- Un cambio en el contrato de la API afecta al frontend. Allá se regeneran los tipos con `npm run api:sync`, que lee `/v3/api-docs` y necesita el backend corriendo.
- El README documenta las decisiones de diseño, el registro de hallazgos de seguridad (SEC-xx) y la deuda técnica conocida. Actualízalo cuando cambie alguna de esas decisiones.

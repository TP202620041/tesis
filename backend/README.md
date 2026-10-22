# Ciudad Viva — Backend

Backend del **Sistema de crowdsourcing geoespacial para el reporte
ciudadano y la gestión municipal de infraestructura vial en Lima
Metropolitana** (Trabajo de Investigación — UPC).

Autores: León Vivas, Fabrizio Amir · Lopez Acuña, Mario Joaquin
Asesor: Reyes Silva, Patricia

## Stack

- **Spring Boot 3.4** (Java 21) — API REST en capas (Controller → Service → Repository).
- **PostgreSQL 16 + PostGIS 3.4** — datos geoespaciales (asignación por distrito, mapa de calor, duplicados).
- **Hibernate Spatial** — mapeo de tipos `GEOGRAPHY` vía JTS.
- **Spring Security + JWT** (jjwt) — autenticación stateless por roles.
- **Flyway** — migraciones de base de datos (SQL versionado).
- **springdoc-openapi** — documentación Swagger UI.

## Requisitos

- JDK 21 (el proyecto compila con `--release 21`).
- Docker + Docker Compose (para Postgres+PostGIS local).
- Maven 3.9+ (o el wrapper del IDE).

> Nota de entorno: si tu `mvn` global apunta a otro JDK, exporta
> `JAVA_HOME` al JDK 21 antes de compilar:
> `export JAVA_HOME="C:/Cursos/SpringCloudKubernetes/jdk-21.0.2"`

## Cómo levantarlo (local)

```bash
# 1. Copia variables de entorno
cp .env.example .env        # ajusta credenciales/secreto JWT si quieres

# 2. Levanta la base de datos (Postgres + PostGIS)
docker compose up -d

# 3. Ejecuta el backend (perfil 'local' por defecto)
#    Flyway aplica las migraciones (V1..V3) automáticamente al arrancar.
mvn spring-boot:run
```

La API queda en `http://localhost:8080`.
Swagger UI: `http://localhost:8080/swagger-ui.html`.

## Perfiles

- `local` (por defecto) — apunta al Postgres de `docker-compose.yml` y firma
  los JWT con el secreto de desarrollo si no exportas `JWT_SECRET` (SEC-03).
  `mvn spring-boot:run` lo activa de forma explícita (`spring-boot.run.profiles`
  en el `pom.xml`); si arrancas el jar o la clase principal desde el IDE sin
  perfil, `local` llega solo por defecto y el secreto de desarrollo ya no vale:
  activa `local` (`SPRING_PROFILES_ACTIVE=local`) o exporta `JWT_SECRET`.
- `dev` — entorno compartido; toda la configuración por variables de entorno
  (`DB_URL`, `DB_USERNAME`, `DB_PASSWORD`, `JWT_SECRET`).
- `test` — lo activan los IT (`src/test/resources/application-test.yml`).
- `prod` — el despliegue; ver [Configuración de producción](#configuración-de-producción).

Fuera de `local` y `test`, `JWT_SECRET` es obligatorio: sin él la aplicación
no arranca (ver SEC-03).

Activar otro perfil: `mvn spring-boot:run -Dspring-boot.run.profiles=dev` (con
`mvn spring-boot:run`, la variable `SPRING_PROFILES_ACTIVE` ya no basta: el
plugin pasa `--spring.profiles.active=local` como argumento, que tiene
prioridad). Al correr el jar: `SPRING_PROFILES_ACTIVE=dev java -jar …`.

## Configuración de producción

El perfil `prod` (`application-prod.yml`) es el del despliegue del MVP
(backend y PostGIS en Railway, PWA en Vercel). Su criterio: **ninguna
variable que apunte a un recurso de producción tiene valor por defecto**. Un
default arrancaría la aplicación contra algo que no es producción; es
preferible que no arranque y que el log diga qué falta.

### Variables de entorno

| Variable | Obligatoria | Qué es |
|---|---|---|
| `JWT_SECRET` | sí | Base64 de al menos 32 bytes (`openssl rand -base64 48`). Sin ella, o con el secreto de desarrollo, no arranca (SEC-03). |
| `DB_URL` | sí | `jdbc:postgresql://<host>:<puerto>/<base>` de un PostgreSQL 16 que tenga PostGIS 3.4 disponible (la V1 ejecuta `CREATE EXTENSION postgis`). |
| `DB_USERNAME`, `DB_PASSWORD` | sí | Credenciales de esa base. |
| `CORS_ALLOWED_ORIGINS` | sí | Origen exacto de la PWA (`https://<proyecto>.vercel.app`); varios, separados por coma. |
| `FOTOS_DIR` | sí | Directorio de las fotos. La imagen ya trae `FOTOS_DIR=/data/fotos`. |
| `PORT` | no (8080) | Lo inyecta la plataforma. |
| `SWAGGER_ENABLED` | no (`false`) | `true` publica `/v3/api-docs` y Swagger UI. |
| `JWT_EXPIRATION_MINUTES`, `VAPID_*`, `PUSH_*`, `MAIL_*`, `NOTIF_FROM`, `LEGAL_VERSION_TERMINOS`, `ASYNC_*` | no | Las mismas de `application.yml`, con sus valores por defecto. |

### Qué cambia respecto de `local`

- **Errores.** `server.error.include-message` e `include-stacktrace` en
  `never`. Solo afectan al `/error` de Spring Boot, que responde lo que no
  pasa por `GlobalExceptionHandler` (un rechazo del firewall de Spring
  Security, un fallo en un filtro). Los `ApiError` de `GlobalExceptionHandler`
  conservan su `message`, que es el que muestra el frontend
  (`frontend/src/lib/api/errors.ts`); `PerfilProdIT` lo comprueba con un 409
  conocido.
- **OpenAPI y Swagger UI** apagados salvo `SWAGGER_ENABLED=true`: la
  documentación del contrato se consulta en local.
- **Flyway** con `baseline-on-migrate: false`. En una base con tablas pero sin
  historial de Flyway, la aplicación falla en vez de tomarla como línea base
  y saltarse la V1, lo que dejaría un esquema a medias.
- **Detrás del proxy** de la plataforma: `server.port: ${PORT:8080}` y
  `forward-headers-strategy: framework`, para que la aplicación vea el
  esquema y el host originales (`https`). Hoy nada usa la IP del cliente; si
  algún día se usa (límite de intentos, auditoría), conviene pasar a
  `native` con la lista de proxies de confianza, porque `framework` acepta las
  cabeceras `X-Forwarded-*` de quien las envíe.
- **Apagado ordenado** (`server.shutdown: graceful`): en un redespliegue
  terminan las peticiones en curso.
- **Logs** en `INFO` y sin el SQL de Hibernate.

### Healthcheck y tiempos de espera (todos los perfiles)

- **Actuator** expone solo `GET /actuator/health`, pública y exacta en
  `SecurityConfig`, y responde únicamente `{"status":"UP"}`: sin detalles ni
  componentes que revelen la base o las versiones. Ningún otro endpoint de
  Actuator se expone por web, ni siquiera a un ADMIN (`/actuator/env` o
  `/actuator/heapdump` entregarían el secreto JWT y la contraseña de la base).
  Lo prueba `ActuatorHealthIT`.
- El health **no incluye el correo** (`management.health.mail.enabled:
  false`): un SMTP caído afecta a cada envío, no a la API, y no debe marcarla
  como caída ni hacer fallar un despliegue. La base de datos sí cuenta: sin
  ella la API no sirve.
- **SMTP con timeouts de 5 s** (conexión, lectura y escritura). JavaMail
  espera indefinidamente por defecto, y la recuperación de contraseña y el
  soporte envían correo dentro de la petición.

## Endpoints implementados (vertical slice inicial)

| Método | Ruta                | Auth | Historia | Descripción |
|--------|---------------------|------|----------|-------------|
| POST   | `/api/auth/registro`| No   | US-01    | Registrar cuenta ciudadana (exige aceptar los términos vigentes, D-12) |
| POST   | `/api/auth/login`   | No   | US-02    | Iniciar sesión (devuelve JWT) |
| GET    | `/api/auth/me`      | Sí   | US-02    | Datos del usuario autenticado (con `debeAceptarTerminos`) |
| GET/POST | `/api/auth/me/consentimientos` | Sí | NC-07b | Consentimientos propios: listar y aceptar (ver [Consentimiento](#consentimiento-d-12-nc-07b)) |
| DELETE | `/api/auth/me/consentimientos/{finalidad}` | Sí | NC-07b | Revocar un consentimiento propio |

### Ejemplo rápido

```bash
# Registro
curl -X POST http://localhost:8080/api/auth/registro \
  -H "Content-Type: application/json" \
  -d '{"email":"vecino@lima.pe","password":"secreta123","nombre":"Ana","apellido":"Ruiz","aceptaTerminos":true,"versionTerminos":"2026-10-v1"}'

# Login
curl -X POST http://localhost:8080/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"vecino@lima.pe","password":"secreta123"}'

# Recurso protegido (usa el token devuelto arriba)
curl http://localhost:8080/api/auth/me -H "Authorization: Bearer <TOKEN>"
```

## Estructura del proyecto

```
src/main/java/pe/edu/upc/viasegura/
├── common/            # Transversal: config, seguridad (JWT), excepciones, entidad base
│   ├── config/        # (reservado) OpenApiConfig, etc.
│   ├── security/      # SecurityConfig, JwtService, JwtAuthenticationFilter
│   ├── exception/     # GlobalExceptionHandler, ApiError, excepciones de dominio
│   ├── domain/        # BaseAuditableEntity (createdAt/updatedAt)
│   ├── port/          # FotoStorageService (fotos de reporte y de perfil, D-11)
│   └── infra/         # LocalFotoStorageService (filesystem)
├── auth/              # US-01..US-04  (Usuario, login/registro, roles)
├── distritos/         # Distrito (límites GEOGRAPHY, base de asignación)
├── municipalidades/   # Municipalidad (1:1 con distrito, D-09) y PeriodoGestion (NC-01)
├── reportes/          # Reporte + CategoriaDano, Adhesion, Historial, Asignacion,
│                      #   Calificacion, ComentarioPublico  (+ port/ + infra/ para Strategy geo)
├── notificaciones/    # Notificacion  (+ port/ + infra/ para Strategy push/email)
├── desempeno/         # IndiceDesempenoDistrital (vista materializada, read-only)
└── soporte/           # TicketSoporte

src/main/resources/db/migration/   # Flyway: V1 esquema+PostGIS, V2 vista MV, V3 seed
```

Cada dominio se organiza en `controller/ · service/ · repository/ · dto/ · domain/`.

## Patrones de diseño previstos (referencia de arquitectura)

- **Repository** (Spring Data JPA) para acceso a datos.
- **Strategy** para la asignación geoespacial de distrito (`distritos/port/` +
  `distritos/infra/`) y para el envío multicanal de notificaciones
  (`notificaciones/port/` + `notificaciones/infra/`).
- **Manejo centralizado de excepciones** con `@RestControllerAdvice`.
- **DTOs** desacoplados de las entidades JPA en todas las capas de API.

## Decisiones de seguridad (alcance académico)

- **Cierre de sesión (US-04) es puramente client-side: no hay blacklist de
  tokens.** La autenticación es JWT stateless (`security.jwt.expiration-minutes`,
  default 120 min); "cerrar sesión" significa que el frontend descarta el
  token, el backend no cambia. Esto es una **decisión deliberada, no un
  descuido**: un blacklist (tabla o Redis consultada en cada request)
  reintroduciría estado de servidor y un lookup por request, anulando la
  ventaja principal de JWT stateless, solo para resolver un caso de uso de
  higiene de sesión (no de respuesta a un compromiso de cuenta, que de
  todas formas requeriría rotar el secreto de firma, fuera de alcance).
  **Consecuencia aceptada y conocida:** un dispositivo comprometido con una
  sesión activa sigue siendo válido hasta que el token expira (máx. 120
  min), incluso si el usuario "cierra sesión" en otro dispositivo o cambia
  su contraseña. Ver también el comentario en
  `common/security/SecurityConfig.java`.
- **CORS** (`SecurityConfig#corsConfigurationSource`): solo los orígenes de
  `app.cors.allowed-origins`, `allowCredentials=false` (el token viaja en
  `Authorization`, no en cookie) y `maxAge` de 1 h para ahorrar preflights.
  Se expone `Content-Disposition` porque el frontend, en otro origen, necesita
  leer el nombre del archivo exportado (US-28); no se expone nada más.

## Idempotencia en la creación de reportes (US-06)

`POST /api/reportes` acepta un header opcional **`Idempotency-Key`**
(UUID generado por el cliente por *intento lógico* de creación, no por
request HTTP — el mismo UUID se reenvía en reintentos del mismo
reporte). Pensado para el reintento de sincronización de un reporte
creado offline (Service Worker) cuando la respuesta original no llegó al
cliente por una conexión caída. Es aditivo: si el header no viene, el
comportamiento es exactamente el de antes (nada se rompe).

Mecanismo: tabla dedicada `idempotency_key` (clave, usuario, cuerpo de la
respuesta, vigencia 48h — ver `V11__idempotency_key.sql`), no una columna
en `reporte`, porque la clave es un metadato del *intento* de creación,
no un atributo del reporte resultante (un intento puede no dejar ningún
reporte nuevo, si termina en adhesión). El detalle completo del diseño y
la vigencia vive en `reportes/service/IdempotencyKeyService.java`.

**Distinción importante — no confundir ambos mecanismos:**

| | 409 de acumulación (US-09) | Respuesta repetida por Idempotency-Key (US-06) |
|---|---|---|
| Significa | "este punto+categoría ya tiene un reporte activo" | "esto es literalmente el mismo intento, reenviado" |
| Se dispara entre | Intentos **distintos** (dos ciudadanos, o el mismo ciudadano reportando dos veces genuinamente) | El **mismo** intento reenviado con la misma clave |
| Efecto | Se adhiere al reporte existente (o 409 si ya se había adherido) | Devuelve la respuesta original sin ejecutar nada de negocio |

Ambos conviven sin pisarse: la clave de idempotencia se resuelve antes de
tocar la lógica de US-09; si la clave no se ha visto antes (o venció), la
deduplicación de US-09 se ejecuta exactamente igual que sin idempotencia.

**Concurrencia — limitación conocida y acotada.** La lectura de la clave
es la ruta rápida, no la garantía. Si dos requests con la misma clave
llegan *simultáneamente*, ambos pueden leer "no hay respuesta previa" y
ejecutar la lógica en paralelo; quien impide la duplicación es la
restricción `UNIQUE (clave, usuario_id)`: la transacción perdedora aborta
y revierte **todo** lo que alcanzó a crear (el registro de la clave ocurre
dentro de la misma transacción que la creación del reporte). El
invariante *"una clave = un efecto de negocio"* se sostiene sin locks.
Consecuencia aceptada: el cliente perdedor recibe un 500 en lugar de la
respuesta cacheada, y su siguiente reintento obtiene el 201 correcto. No
se añadió un lock ni un reintento sobre `DataIntegrityViolationException`
porque el caso de uso real de US-06 es la resincronización diferida de un
Service Worker (reintento secuencial tras timeout), no requests
concurrentes.

## Parámetros mal tipados y rango de fechas (US-12)

Un parámetro de query o de ruta que no se puede convertir a su tipo
(`fechaDesde=ayer`, `estado=ARREGLADO`, `distritoId=abc`) responde **400**
con el nombre del parámetro y el formato esperado (fecha ISO-8601 en UTC,
valores del enum o número), sin repetir el valor recibido. Antes caía en el
manejador genérico y respondía **500**, como si el servidor hubiera fallado.
Lo resuelve `GlobalExceptionHandler` para `MethodArgumentTypeMismatchException`,
así que aplica a todos los endpoints (también al filtro `estado` de los
tickets de soporte).

En `GET /api/reportes` y en la exportación municipal (`GET /api/reportes/exportar`),
`fechaDesde > fechaHasta` es **400** (regla única en `reportes/domain/RangoFechas`): un rango
invertido no puede tener resultados y una página vacía escondería el error
del cliente. Ambos bordes son inclusivos (`created_at >= fechaDesde` y
`<= fechaHasta`), así que `fechaDesde == fechaHasta` es válido. Las fechas son
instantes UTC: convertir el "día local" a instantes es tarea del cliente.

## Errores del cliente que respondían 500 (DEP-11)

Tres excepciones de Spring MVC caían en el manejador genérico de
`GlobalExceptionHandler` y respondían **500**: "el servidor falló" cuando la
petición era inválida, y en producción un 500 dispara alertas por un caso
normal. Ahora responden con el mismo `ApiError` que el resto:

| Excepción | Código | Ejemplo | Mensaje |
|---|---|---|---|
| `MaxUploadSizeExceededException` | **413** | Foto de más de 10 MB en `POST /api/reportes` o `PATCH /api/auth/me` | `La foto supera 10 MB` (el límite sale de `spring.servlet.multipart.max-file-size`; es el mismo texto con que la PWA lo valida antes de subir) |
| `HttpRequestMethodNotSupportedException` | **405** | `GET /api/auth/login` | `El metodo GET no esta permitido en esta ruta`, con la cabecera `Allow` que exige el RFC 9110 |
| `MissingServletRequestParameterException` | **400** | `GET /api/distritos/por-coordenadas` sin `lon` | `Falta el parametro obligatorio 'lon'` |

Lo prueba `ErroresHttpIT`, con servidor real (`RANDOM_PORT`) para el 413
porque el límite lo aplica Tomcat al leer el multipart y MockMvc no lo
ejecuta.

**Límite conocido del 413.** Los límites son 10 MB por archivo y 12 MB por
petición. Una foto de entre 10 y 12 MB recibe el 413 (Tomcat la corta al
pasar los 10 MB y descarta el resto). Pero si la petición entera supera los
12 MB, Tomcat la rechaza por su `Content-Length` antes de leer el cuerpo y,
como solo descarta hasta 2 MB sin leer (`server.tomcat.max-swallow-size`),
cierra la conexión: el cliente ve un error de red en lugar del 413 (se
verificó con 13 MB). Se dejó así a propósito: subir ese tope obliga al
servidor a leer y descartar cuerpos arbitrariamente grandes, y la PWA nunca
llega a ese caso porque valida los 10 MB antes de subir.

Dos endpoints **públicos** de solo lectura que existen para que un cliente
pueda *descubrir* los identificadores que el resto de la API exige. No los
pide ninguna historia de forma literal, pero sin ellos el frontend no puede
construir la UI de US-05 (crear reporte), US-10 (mapa) ni US-12 (búsqueda):
todas necesitan un `categoriaId` o un `distritoId` válido.

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| GET | `/api/categorias` | No | Categorías seleccionables. Sin `?distritoId=`: solo las 6 estándar. Con él: estándar + personalizadas activas de ese distrito (US-29). |
| GET | `/api/distritos` | No | Los 43 distritos (id, nombre, ubigeo) en orden alfabético. |

Son públicos por el mismo criterio que la búsqueda de reportes (US-10/US-12),
que ya es pública y filtra por esos mismos ids: un filtro público cuyo
catálogo exigiera token sería incoherente. No exponen PII. **Solo el `GET`
es público** — el `POST /api/categorias` (US-29) sigue exigiendo token y rol
`FUNCIONARIO_MUNICIPAL`.

**Por defecto `/api/categorias` devuelve solo las estándar.** Una categoría
personalizada solo es válida en *su* distrito
(`ReporteService#validarCategoriaParaDistrito`); devolver las de los 43
distritos dejaría elegir una que el `POST /api/reportes` rechaza con 409. Con
`distritoId` se devuelve exactamente lo válido ahí. Así, **todo lo que este
endpoint devuelve es siempre seleccionable** (también se filtran las
`activo = false`, que el POST igualmente rechazaría).

### Gestión de categorías personalizadas (US-29)

| Método | Ruta | Rol | Descripción |
|---|---|---|---|
| GET | `/api/categorias/gestion` | FUNCIONARIO_MUNICIPAL | Estándar + personalizadas de su distrito, **incluidas las inactivas**, con `activo` (`CategoriaGestionResponse`). |
| PATCH | `/api/categorias/{id}` | FUNCIONARIO_MUNICIPAL | Edita `nombre` y `descripcion` de una personalizada de su distrito. |
| PATCH | `/api/categorias/{id}/activa` | FUNCIONARIO_MUNICIPAL | `{ "activa": bool }`: desactiva o reactiva una personalizada de su distrito. |

- **Desactivar solo deja de ofrecerla** (decisión del usuario, 13/10): sale
  del catálogo público y no se puede elegir para un reporte nuevo ni al
  *cambiar* la categoría de uno existente (409). Los reportes que ya la usan
  quedan intactos y siguen editables: `ReporteService#editar` solo valida la
  categoría cuando cambia, así que reenviar la actual o editar solo la
  descripción funciona aunque esté inactiva. Es reversible y no cambia
  ningún KPI (el desglose de US-20 agrupa por la categoría que ya tiene cada
  reporte), por eso no publica evento.
- **Las estándar no se gestionan**: se listan en la vista de gestión pero
  editarlas o desactivarlas da 403 (`OperacionNoPermitidaException`, con
  mensaje). Una personalizada de otro distrito también da 403; una
  inexistente, 404.
- **Nombre único** sin distinguir mayúsculas dentro del distrito **y frente a
  las estándar** (409), al crear y al editar: dos opciones iguales en el
  mismo selector serían ambiguas.
- `activo` solo aparece en el DTO de gestión; el `GET /api/categorias`
  público sigue sin exponerlo.
- El servicio obtiene al funcionario con `auth.service.UsuarioConsultaService`
  (API pública de `auth`), no con `UsuarioRepository`; eso retiró 3
  violaciones congeladas de ArchUnit.

### ¿Por qué `/api/distritos` si `/api/desempeno/distritos` ya devuelve los 43?

No es duplicación: son dos cosas distintas que coinciden en los datos.

| | `/api/distritos` | `/api/desempeno/distritos` |
|---|---|---|
| Propósito | Catálogo de referencia | Reporte de transparencia (US-18) |
| Orden | Alfabético (selector) | Por tasa de resolución DESC (ranking) |
| Origen | Tabla `distrito` | Vista materializada `mv_indice_desempeno_distrital` |
| Payload | id, nombre, ubigeo | + tasa, tiempo promedio, satisfacción, totales |

El punto decisivo es el **origen**: atar el formulario de crear reporte —la
pantalla más crítica del producto— al estado de refresco de una vista
materializada de métricas sería un acoplamiento frágil. El catálogo lee la
tabla base directamente. Y un cambio futuro en el ranking (paginarlo, ocultar
distritos sin datos) rompería el selector si compartieran endpoint.

`DistritoResponse` **no expone `limites`**: el MultiPolygon pesa miles de
vértices y no sirve para poblar un `<select>`. Si el frontend llega a
necesitar los polígonos para dibujarlos, eso amerita un endpoint propio con
GeoJSON y su política de caché. El mapa de calor (US-11) no los necesita:
usa la densidad en grilla de la sección siguiente.

## Mapa de calor (US-11)

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| GET | `/api/reportes/densidad` | No | Reportes agrupados en una grilla fija para la capa de calor. Filtros opcionales `distritoId`, `categoriaId`, `estado`, `fechaDesde`, `fechaHasta`. |

```json
{"celdaGrados": 0.001, "totalReportes": 3,
 "celdas": [{"latitud": -12.121, "longitud": -77.03, "cantidad": 2},
            {"latitud": -12.086, "longitud": -76.976, "cantidad": 1}]}
```

**Grilla en la base, no puntos.** `ST_SnapToGrid` lleva cada reporte al nodo
más cercano de una grilla de **0.001°** (≈111 m × 109 m en Lima) y se cuenta
por nodo. La respuesta crece con las celdas ocupadas, no con los reportes, y
el tamaño de celda es fijo en el servidor (no es un parámetro): el cliente no
puede pedir una grilla tan fina que equivalga a la lista de puntos, y una
misma URL siempre devuelve lo mismo, lo que la hace cacheable. A la escala
de una ciudad, 100 m es menos que el radio con que se dibuja cada punto de
calor.

**Mismos filtros y misma visibilidad que la búsqueda pública** (US-10/US-12):
sin `estado`, todo salvo `CANCELADO`; un rango de fechas invertido es 400
(`RangoFechas`). La capa de calor se dibuja sobre el mismo mapa que los
marcadores y con los mismos filtros, así que no puede contar otra cosa.

**SEC-01: lo que hace la municipalidad no saca un reporte del mapa.** Por
defecto cuentan `RECHAZADO` y `RESUELTO`. Si contaran solo los activos, una
municipalidad podría «enfriar» su distrito rechazando reportes, y un actor
cambiaría la métrica pública que lo expone. Quien quiera ver solo lo
pendiente filtra por `estado`. La única salida es `CANCELADO`, que solo hace
el ciudadano creador desde `PENDIENTE` (US-08).

**Cada reporte pesa 1, no `totalAdhesiones`.** Las adhesiones (US-09) las
suma cualquier ciudadano con un clic, y ponderar por ellas dejaría inflar la
densidad de una zona sin reportar nada nuevo. Contar reportes no se infla
con duplicados porque US-09 ya convierte en adhesión un reporte de la misma
categoría a menos de 20 m de otro activo.

**SEC-02: sin señales internas.** `DensidadReportesResponse` tiene
`celdaGrados`, `totalReportes` y `celdas`; cada celda, `latitud`, `longitud`
y `cantidad`. Nada más: ni ids, ni categoría, ni estado, ni
`posibleReincidencia`, ni nada que dependa de quién consulta. Con o sin
token, la respuesta es la misma. `DensidadReportesIT` lo comprueba campo por
campo sobre un reporte marcado como posible reincidencia.

### Política de caché

Caché **HTTP**, sin caché en el servidor:

- `Cache-Control: public, max-age=60`. Durante un minuto el navegador (o un
  proxy o CDN) reutiliza la respuesta de esa URL sin llegar al backend.
  `public` es correcto porque la respuesta no depende del usuario, aunque el
  pedido lleve `Authorization`.
- `ETag` fuerte: SHA-256 del contenido, truncado a 128 bits. Pasado el minuto, el cliente revalida
  con `If-None-Match`, y si nada cambió recibe **304** sin cuerpo (lo resuelve
  Spring MVC al ver el ETag en un GET). Las coordenadas se redondean al
  decimal de la celda para que el mismo contenido dé siempre el mismo ETag.

**Por qué 60 s y no la frescura de eventos del índice de desempeño.** El
índice (US-18) es una métrica de desempeño y se refresca con cada evento que
la cambia. El mapa de calor es una vista de contexto: un reporte nuevo
aparece, como mucho, un minuto tarde, y a cambio un mapa que se reabre o se
recarga no repite la agregación. **Sin caché en el servidor** (Spring Cache,
vista materializada) a propósito: obligaría a invalidarla con los mismos
eventos que el índice, y con varias instancias, a compartirla. La consulta
usa los índices de `reporte` (`distrito_id`, `estado`, `categoria_id`) y
agrega en la base; a la escala de la tesis no compensa. Si creciera, el paso
siguiente es una vista materializada por celda refrescada por eventos, como
`mv_indice_desempeno_distrital`.

**Service Worker.** La PWA deja el API fuera de la caché del Service Worker
(US-04). Esta política la aplica la caché HTTP del navegador, no el SW.

## Registro de hallazgos de seguridad

Hallazgos encontrados durante el desarrollo, con su corrección. Se documentan
porque el sistema existe para hacer **auditable** el desempeño municipal: un
fallo que permita manipular esas métricas ataca el valor central del proyecto,
y conviene dejar evidencia de que el proceso lo detectó y lo cerró.

### SEC-01 — Un funcionario podía cancelar reportes de su distrito

**Detectado:** 2026-08-29, al construir la bandeja municipal en el frontend.
**Estado:** corregido y cubierto por regresión.

**El problema.** `PATCH /api/reportes/{id}/estado` (endpoint del rol
`FUNCIONARIO_MUNICIPAL`) validaba las transiciones contra un único conjunto,
`EstadoReporte.transicionesPermitidas()`, que mezclaba las potestades de los
dos actores del sistema. Ese conjunto incluía `PENDIENTE → CANCELADO` porque
esa transición **sí** es legítima… pero para el *ciudadano creador*, que
retira su propio reporte vía `DELETE /api/reportes/{id}` (US-08). El endpoint
municipal la heredaba sin querer.

**Por qué importaba más de lo que parece.** Un reporte `CANCELADO`:

- queda **excluido de `total_reportes`** en la vista materializada de
  desempeño distrital (migración V7), y
- **no aparece en la búsqueda pública** ni en el mapa (Fase 22).

Es decir, una municipalidad podía hacer desaparecer del escrutinio público
los reportes que le resultaran incómodos —y de sus propias métricas de
desempeño— **disfrazado de retiro voluntario del vecino**, sin el comentario
justificatorio y la traza que sí exige un `RECHAZADO`. Justo lo contrario de
lo que el sistema pretende garantizar.

**La corrección.** Se modeló el actor en la máquina de estados en lugar de
añadir solo un guardia puntual, porque la causa raíz era la *mezcla* de
potestades, no la falta de un `if`:

- `EstadoReporte.transicionesDeGestionMunicipal()` — lo que puede hacer la
  municipalidad. **No contiene `CANCELADO` en ningún caso.**
- `EstadoReporte.elCreadorPuedeCancelar()` — la única vía a `CANCELADO`, solo
  desde `PENDIENTE`, usada por `ReporteService#cancelar`.

Así, quien agregue un estado nuevo debe decidir a qué actor pertenece, en vez
de heredar por omisión uno que no le corresponde. Además se dejó un **guardia
explícito** en `GestionReporteService#cambiarEstado` que rechaza el destino
`CANCELADO` con **403** y un mensaje que indica la vía correcta: es defensa en
profundidad (si alguien reintrodujera el estado en el conjunto, seguiría
bloqueado) y da un error que se entiende — un 409 de "transición inválida"
habría sido engañoso, porque la transición *sí* es válida para el otro actor.

**Regresión:** `CancelacionSoloDelCreadorIT`, en una clase propia y no diluida
entre los tests generales de la máquina de estados. Cubre: el funcionario es
rechazado desde *todos* los estados de partida (no solo el explotable) y el
estado no cambia en la base; el mensaje orienta hacia `RECHAZADO`; el
funcionario **sí** puede rechazar (no se le dejó sin vía para descartar); y el
creador **sí** puede seguir cancelando (US-08 intacto).

**Efecto colateral útil.** Se añadió `OperacionNoPermitidaException` → 403
*conservando el mensaje*. El manejador de `AccessDeniedException` responde con
un "Acceso denegado" fijo (correcto: esa excepción también la lanza Spring
Security desde `@PreAuthorize` y sus textos internos no son para el usuario
final), pero aquí el mensaje era la parte útil.

### SEC-02 — La señal de reincidencia llegaba al mapa público y al ciudadano

**Detectado:** 2026-10-13, en la revisión del Sprint 2 (B5).
**Estado:** corregido y cubierto por regresión.

**El problema.** `posibleReincidencia` (US-27) la marca el `ReincidenciaDetector`
cuando un comentario público sugiere que el daño reapareció, y sirve para
**resaltar el reporte en la bandeja municipal**. El campo vivía en
`ReporteResumenResponse`, un DTO que nació para la bandeja y que después se
reutilizó para la búsqueda y el detalle públicos (`GET /api/reportes`,
`GET /api/reportes/{id}`, sin autenticación) y para las vistas del ciudadano
(`mis-reportes`, `pendientes-calificacion`, editar y cancelar). En
`ComentarioPublicoResponse` ya se había quitado el flag por esta razón, pero
el mismo dato seguía saliendo por el resumen del reporte: se revisó la ruta,
no el campo.

**Por qué importaba.** Con el flag visible, cualquiera puede comentar,
consultar el reporte y ver si el detector se disparó: probando redacciones
reconstruye su lista de palabras clave. Y como el flag decide qué reportes
resalta la bandeja, sondearlo es poder **manipular en qué se fija el
municipio** (o evitar que se fije en algo).

**La corrección.** Dos DTOs con los mismos nombres de campo:

| DTO | Lleva el flag | Endpoints |
|---|---|---|
| `ReporteResumenResponse` | **no** | `GET /api/reportes`, `GET /api/reportes/{id}`, `GET /mis-reportes`, `GET /mis-reportes/pendientes-calificacion`, `PATCH /api/reportes/{id}`, `DELETE /api/reportes/{id}` |
| `ReporteGestionResponse` | sí | `GET /api/reportes/bandeja`, `PATCH /api/reportes/{id}/estado` (rol `FUNCIONARIO_MUNICIPAL`, acotados a su distrito) |

`ReporteResponse` (crear o adherirse) nunca lo llevó. Se prefirió un DTO
aparte y no `@JsonView` ni un campo `null` según el rol: el contrato queda
explícito en el tipo, OpenAPI genera dos esquemas distintos para el
frontend, y una señal operativa nueva tiene un único lugar donde ir. El
detalle de gestión del frontend ya se arma desde la bandeja, así que no
hizo falta un endpoint nuevo.

**Regresión:** `SenalInternaFueraDeDtosPublicosIT`. Cada caso usa un reporte
**con el flag en `true`** (un campo ausente en un reporte sin marcar no
probaría nada) y afirma primero que el reporte está en la respuesta, para que
el `doesNotExist` no pase sobre una lista vacía. Cubre los siete endpoints
públicos y del ciudadano (la búsqueda por filtros y por área, que son dos
queries), el `POST` de crear/adherirse, y que la bandeja y el cambio de estado
**sí** lo devuelven. Con el DTO anterior fallan exactamente los siete casos
públicos y del ciudadano.

### SEC-03 — El secreto JWT tenía un valor por defecto versionado

**Detectado:** 2026-10-21, al preparar el despliegue del MVP (DEP-01).
**Estado:** corregido y cubierto por tests. **Exige rotar el secreto** en
todo entorno que haya usado el viejo.

**El problema.** `application.yml` resolvía `security.jwt.secret` con
`${JWT_SECRET:<valor>}`, es decir, con un secreto por defecto escrito en el
repositorio (y repetido en `.env.example`). Un entorno que olvidara definir
`JWT_SECRET` arrancaba sin ningún aviso, firmando con un secreto público.

**Por qué importaba.** El JWT lleva el email como `subject`, y
`JwtAuthenticationFilter` carga el usuario, con su rol real, a partir de ese
email. Quien conoce el secreto firma un token con el email de cualquier
cuenta y la suplanta sin saber su contraseña: un ADMIN, o un funcionario que
gestiona los reportes de su distrito y con ellos las métricas de desempeño
(ver SEC-01). Bastaba con leer el repositorio en GitHub.

**La corrección.**

- La configuración base ya no trae valor por defecto (`${JWT_SECRET:}`).
- `JwtService` no deja arrancar la aplicación si el secreto falta, está
  vacío, no es Base64 o tiene menos de 32 bytes (lo mínimo para HS256). El
  mensaje dice cómo generar uno (`openssl rand -base64 48`) y nunca repite el
  valor recibido.
- El secreto de desarrollo sigue en el repositorio (`application-local.yml`
  y `src/test/resources/application-test.yml`), pero `JwtService` solo lo
  acepta si se cumplen **dos** condiciones: la bandera
  `security.jwt.permitir-secreto-de-desarrollo=true` (la definen solo esos dos
  archivos; `prod` la fija en `false`) y el perfil `local` o `test` activado
  **de forma explícita**. La comparación es por bytes decodificados, así que
  otra codificación de la misma clave también se rechaza.
- Por qué no basta la bandera: `application.yml` declara
  `spring.profiles.default: local`, y Spring Boot carga
  `application-local.yml` también cuando `local` llega solo por defecto. Un
  despliegue sin `SPRING_PROFILES_ACTIVE` (o con la variable vacía) tendría la
  bandera en `true` y volvería a firmar con el secreto público. Por eso
  `JwtService` mira `Environment#getActiveProfiles()`, que no incluye los
  perfiles por defecto. `mvn spring-boot:run` sigue funcionando sin cambios:
  el `pom.xml` fija `spring-boot.run.profiles=local`, que activa el perfil de
  forma explícita. La imagen Docker fija `SPRING_PROFILES_ACTIVE=prod`.
- `.env.example` deja `JWT_SECRET=` vacío, con la instrucción para
  generarlo.

**Rotación.** Todo entorno que haya corrido con el secreto viejo (un
despliegue sin `JWT_SECRET`, o uno que copió el valor de `.env.example`) debe
generar uno nuevo. Rotar invalida de una vez todos los tokens emitidos,
también los forjados; a los usuarios solo se les pide volver a iniciar
sesión. Borrar el valor del archivo no basta, porque sigue en el historial de
git: por eso `JwtService` lo rechaza por su contenido.

**Regresión:** `JwtServiceTest` cubre el secreto ausente, vacío o en blanco,
el que no es Base64, los de 31 y 32 bytes, el publicado con y sin la bandera
(y con otra codificación), que los mensajes no lo repiten y que un token de
ADMIN forjado con el secreto viejo no verifica en un entorno con secreto
propio; y, con un entorno simulado, que el secreto de desarrollo se acepta
con `local` o `test` explícitos y se rechaza con `local` solo por defecto, en
`prod` aunque se fuerce la bandera, y con `local` pero sin la bandera.
`ArranqueSinPerfilExplicitoIT` arranca la aplicación real sin perfil
explícito y con el secreto de desarrollo: comprueba que `local` llegó por
defecto con la bandera en `true` y que, aun así, no arranca (con solo la
bandera, la misma prueba llegaba hasta la conexión a la base). `PerfilProdIT`
arranca el perfil `prod` con un secreto propio, comprueba que ahí la bandera
queda en `false` y que un token forjado con el secreto publicado recibe 401.

## Frescura del índice de desempeño

El índice público (US-18/US-20) se sirve desde una vista materializada que se
refresca **dirigida por eventos**, `AFTER_COMMIT`, con
`REFRESH MATERIALIZED VIEW CONCURRENTLY`. Mantiene la lectura pública barata
—es un endpoint sin autenticación y potencialmente de alto tráfico— sin
renunciar al "tiempo real" que pide el backlog.

**Corrección (2026-08-30).** La justificación original enumeraba solo *dos*
disparadores: resolver un reporte y calificarlo. Estaba incompleta, y el hueco
era observable: **crear un reporte incrementa `total_reportes`**, que es el
denominador de la tasa de resolución. Sin refresco, un distrito que recibía
reportes nuevos sin resolver seguía publicando su tasa anterior —mejor que la
real— hasta que ocurriera algo no relacionado. Al revisarlo aparecieron dos
casos más del mismo tipo:

| Evento | Efecto sobre la vista |
|---|---|
| Crear un reporte (US-05) | +1 en `total_reportes` |
| Resolver un reporte (US-14) | +1 en `total_resueltos`; cambia el tiempo promedio |
| Cancelar un reporte (US-08) | −1 en `total_reportes` (la vista excluye `CANCELADO`, migración V7) |
| Calificar la atención (US-26) | cambia la satisfacción promedio |
| Cambiar la categoría (US-08) | mueve el reporte entre filas `(distrito, categoría)`: afecta el desglose de US-20, no el agregado |

**No** disparan refresco, deliberadamente: adherirse a un reporte existente
(US-09 no crea una fila nueva, así que el total no cambia) y los estados
`RECIBIDO` / `EN_PROCESO` / `RECHAZADO`, que no alteran ni el total ni los
resueltos.

La lección que vale registrar: al elegir un modelo dirigido por eventos, la
parte frágil no es el mecanismo sino **la enumeración de los eventos**. Aquí
se enumeraron los que cambian el *numerador* y se pasó por alto el
*denominador*.

## Fotos: dos visibilidades, dos mecanismos

Las fotos se guardan en el filesystem local (`app.storage.fotos-dir`) pero
**no todas tienen la misma visibilidad**, y esa diferencia es de seguridad,
no de orden:

| | Foto de reporte (US-05) | Foto de perfil (US-30) |
|---|---|---|
| Qué es | Evidencia de un daño vial | Dato personal del ciudadano |
| Directorio | `<fotos-dir>/reportes` | `<fotos-dir>/perfiles` |
| URL | `/media/fotos/reportes/{uuid}` | `/api/perfiles/fotos/{uuid}` |
| Acceso | **Público**, sin token | **Solo el dueño** |
| Mecanismo | `addResourceHandlers` (`WebMvcConfig`) | `PerfilFotoController` |

**Por qué las de reporte son públicas:** el mapa y la búsqueda (US-10/US-12)
ya son públicos y devuelven `fotoUrl`; si la foto exigiera token, el mapa
mostraría imágenes rotas a cualquier visitante.

**Por qué mecanismos distintos.** Una foto de reporte es un archivo estático
sin regla de autorización: `addResourceHandlers` resuelve content-type,
`ETag`, `Last-Modified`, peticiones de rango y protección contra path
traversal sin código propio. Una foto de perfil exige comprobar que quien la
pide **es su dueño** — autorización *por instancia*, no por patrón de ruta.
`SecurityConfig` protege rutas por rol y no puede expresarlo, así que hace
falta un controlador que lea al usuario autenticado y lo compare con el dueño
real del archivo.

**Defensa contra path traversal en el endpoint dedicado.** Al no heredar la
protección del resource handler, hay que replicarla. El nombre que llega en
la URL **nunca se usa para tocar el disco**: solo se *compara* contra el
nombre registrado en `usuario.foto_url`, y la lectura se hace con el valor
registrado. Una entrada como `../../../etc/passwd` jamás coincide con un UUID
almacenado, así que se rechaza antes de llegar al filesystem — más robusto que
sanear la cadena, porque no hay que anticipar todas las formas de escaparse.
`LocalFotoStorageService#cargarFotoPerfil` añade una verificación de
contención de ruta como segunda barrera.

**404 en vez de 403** cuando el archivo pedido no es del solicitante: es una
desviación deliberada del criterio general del proyecto, porque un 403
confirmaría que ese archivo existe y se trata de fotos de personas.

## Suscripciones push (NC-07)

La PWA registra cada navegador suscrito con la Push API en `suscripcion_push`
(V12): el `endpoint` del servicio de push y las claves `p256dh`/`auth` con las
que se cifra el mensaje, tal como las entrega `PushSubscription.toJSON()`.

| Método | Ruta | Respuesta |
|---|---|---|
| POST | `/api/notificaciones/suscripciones` | 201 si es nueva, 200 si el endpoint ya existía |
| DELETE | `/api/notificaciones/suscripciones` (cuerpo `{endpoint}`) | 204, o 404 si no es del usuario |

Cualquier rol autenticado; sin token, 401.

**Upsert por endpoint, con reasignación.** El `endpoint` identifica al
*navegador*, no a la persona, por eso es `UNIQUE`. Si llega uno que ya está
registrado, se actualizan las claves (el navegador puede rotarlas), se
reactiva y **pasa al usuario autenticado aunque fuera de otro**: en ese
navegador inició sesión otra persona, y los avisos de la anterior no deben
seguir apareciendo ahí. La alternativa (rechazar con 409) dejaría al nuevo
usuario sin push en su propio dispositivo hasta que el anterior se diera de
baja, cosa que normalmente no hace. Reclamar un endpoint ajeno exige
conocerlo, y es una URL de capacidad que el servicio de push genera al azar
para ese navegador.

**La baja borra la fila** (no la marca inactiva): no hay razón para conservar
las claves de un navegador que se dio de baja. Una ajena responde **404**,
como una inexistente: lo que protege es que nadie borre lo ajeno, no el
secreto de que el endpoint existe (eso ya lo delata el POST con 200 frente a
201, y el endpoint solo lo conoce quien tiene el navegador). `activa = false`
queda para US-21, cuando el servicio de push responda que una suscripción
caducó. La respuesta nunca devuelve las claves.

**Lista blanca de servicios de push (contra SSRF).** Con el envío real
(US-21) el servidor hará peticiones al `endpoint` que manda el cliente; sin
control, un usuario podría registrar `https://169.254.169.254/…` o una IP
interna y usar el backend como proxy. `notificaciones/domain/PoliticaEndpointPush`
solo admite los hosts de `app.notificaciones.push.hosts-permitidos` (por
defecto `fcm.googleapis.com`, `*.push.services.mozilla.com`,
`*.notify.windows.com`, `web.push.apple.com`; variable `PUSH_HOSTS_PERMITIDOS`).
El host sale de parsear la URL con `java.net.URI`, no de una regex sobre la
cadena, y además se exigen `https`, sin `usuario@`, puerto por defecto y que no
sea una IP literal; así fallan `fcm.googleapis.com.evil.com`,
`fcm.googleapis.com@evil.com` o `evil.com/fcm.googleapis.com`. Fuera de la
lista: **400**.

**Tope por usuario** (`app.notificaciones.push.max-por-usuario`, 10 por
defecto). Al superarlo se **borran las menos recientemente registradas** (cada
POST refresca `updated_at`), en vez de responder 409: el usuario no puede dar
de baja a mano las de navegadores que ya no usa (no tiene su endpoint), así
que un 409 lo dejaría sin push en el dispositivo nuevo.

**Altas simultáneas.** El upsert es un único `INSERT … ON CONFLICT (endpoint)
DO UPDATE … RETURNING (xmax = 0)`: dos POST a la vez con el mismo endpoint
nuevo ya no chocan con el `UNIQUE` (antes, `DataIntegrityViolationException`
→ 500); uno inserta (201) y el otro actualiza (200).

**Efecto en las notificaciones.** Desde US-21 el envío es real: ver
[Envío push real (US-21)](#envío-push-real-us-21).

**Desde NC-07b, suscribirse exige el consentimiento `NOTIFICACIONES_PUSH`
vigente** (409 si no lo hay), y revocarlo borra todas las suscripciones del
usuario: ver la sección siguiente.

## Envío push real (US-21)

**Librería: `com.zerodeplibs:zerodep-web-push-java` 2.1.5** (MIT), detrás del
puerto `notificaciones/port/EnviadorWebPush` con su adaptador
`notificaciones/infra/ZerodepWebPushAdapter`. Se eligió así (revisado en Maven
Central el 19/10/2026):

| Librería | Última versión | Por qué sí / por qué no |
|---|---|---|
| `zerodep-web-push-java` | 2.1.5 (31/12/2025; 2.1.3 y 2.1.4 en nov. 2025) | **Elegida.** Mantenida, MIT, **sin dependencias en tiempo de ejecución**: VAPID (RFC 8292) y cifrado `aes128gcm` (RFC 8291) con la criptografía del JDK, y envío con `java.net.http.HttpClient`. No suma nada al classpath que pueda chocar con Spring Boot. |
| `nl.martijndwars:web-push` | 5.1.2 (feb. 2025) | Descartada: arrastra `bcprov-jdk15on` 1.70 (el artefacto viejo de BouncyCastle, reemplazado por `jdk18on`), `httpasyncclient` 4.x y `async-http-client` 2.12. Más superficie de dependencias y de CVE para lo mismo. |
| `com.interaso:webpush` | 1.3.0 (ene. 2026) | Mantenida, pero es Kotlin: suma el runtime de Kotlin a un backend Java. |

Cambiar de librería es cambiar solo el adaptador: el resto del código usa el
puerto.

**Riesgo aceptado y mitigaciones.** La librería tiene un solo mantenedor y no
tiene auditoría de seguridad pública. A favor: no implementa criptografía
propia, sino que compone primitivas del JDK (ECDH, HKDF sobre HMAC-SHA-256,
AES-GCM, ECDSA). Mitigaciones:

- `WebPushInteroperabilidadTest` (Surefire, sin red) la contrasta con una
  implementación independiente escrita solo con el JDK. Genera un par P-256
  y un `auth` de «navegador», arma el pedido con la librería, **descifra** el
  cuerpo `aes128gcm` (RFC 8291 / RFC 8188) y compara el texto. Además
  **verifica** la firma ES256 del JWT de `Authorization: vapid t=…,k=…` con
  la clave pública y sus claims `aud`, `sub` y `exp` (RFC 8292). También
  comprueba que otro par de claves no puede descifrar el mensaje.
- El puerto `EnviadorWebPush` permite cambiarla sin tocar el resto.
- Versión fija (2.1.5, sin rangos). SHA-1 del jar en Maven Central:
  `02fa1d9e72a281c25eac128b3a7a0633cc0d1395` (coincide con el descargado).

**Claves VAPID por entorno, nunca en el repo.** `VAPID_PUBLIC_KEY`,
`VAPID_PRIVATE_KEY` (base64url, el formato de `web-push`) y `VAPID_SUBJECT`
(`mailto:…` o `https://…`). Para generarlas:

```bash
npx web-push generate-vapid-keys      # imprime Public Key y Private Key
export VAPID_PUBLIC_KEY=...  VAPID_PRIVATE_KEY=...  VAPID_SUBJECT=mailto:soporte@viasegura.pe
```

Sin las tres, o con claves inválidas, el adaptador queda **sin configurar**:
la app arranca igual (lo deja en el log), el canal PUSH se reporta no
disponible y el aviso cae a correo si hay permiso. Cambiar las claves invalida
todas las suscripciones existentes (el navegador las creó con la pública
anterior). Tras rotarlas, el servicio de push responde **401/403** a esas
suscripciones y fallan (el aviso cae a correo si hay permiso) hasta que el
navegador se vuelve a suscribir con la clave nueva. **401/403 no desactiva la
suscripción**, a propósito: desde el servidor no se distingue una suscripción
creada con la clave vieja de un error de configuración propio (sujeto, reloj,
claves mal copiadas), y en ese caso se desactivarían las de todos los
usuarios de una vez. Se registra un aviso en el log, y el frontend se vuelve a
suscribir al iniciar sesión si la clave pública cambió (ver el handoff).

**Clave pública:** `GET /api/notificaciones/vapid-public-key` →
`{"clavePublica": "..."}`, o 404 si no hay claves. Es pública (ruta exacta y
solo GET en `SecurityConfig`; la guarda de términos no la toca), porque el
navegador la necesita para `pushManager.subscribe` y no identifica a nadie.

**Qué se envía.** Al cambiar el estado de un reporte, `PushNotificacionAdapter`
envía a **todas** las suscripciones activas del ciudadano (móvil y PC), si
tiene el permiso `NOTIFICACIONES_PUSH` y su preferencia incluye PUSH. El
payload es JSON:

```json
{"titulo": "Ciudad Viva: su reporte esta en proceso",
 "cuerpo": "Su reporte #42 esta en proceso.",
 "url": "/mis-reportes/42", "reporteId": 42, "estado": "EN_PROCESO"}
```

Solo datos del reporte del propio ciudadano: ninguna señal interna
(reincidencia, prioridad) ni datos de otros usuarios. El cuerpo no lleva el
comentario del municipio ni el distrito: una notificación se ve en la pantalla
bloqueada, y el detalle está al abrir el reporte (el correo sí lo lleva). El
cuerpo dice el estado en palabras («esta en proceso», «fue resuelto»); el
valor técnico viaja aparte en `estado`. TTL
de 24 h (después el aviso pierde sentido) y tópico `reporte-{id}`: si hay un
aviso pendiente del mismo reporte, el servicio de push lo reemplaza por el
nuevo.

**Respuestas del servicio de push.**

- 2xx: entregado. Con al menos una entrega, la notificación queda `ENVIADA`.
- **404/410: la suscripción queda `activa = false`** y no se vuelve a
  intentar. Se conserva la fila, en vez de borrarla, porque el navegador puede
  volver a suscribirse con el mismo endpoint y el upsert la reactiva; el tope
  por usuario la desaloja con el tiempo.
- Cualquier otro error (red, timeout, 4xx/5xx): esa suscripción no se toca,
  porque puede ser transitorio. Si no se entregó a ninguna, el canal lanza,
  `NotificacionService` registra el push `FALLIDA` y cae a correo si hay
  permiso. El cambio de estado nunca se ve afectado.

**Fuera del hilo del funcionario y fuera de la transacción.** El listener de
notificaciones (`AFTER_COMMIT`) solo encola `NotificacionService.notificarCambioEstado`,
que es `@Async` en el executor acotado de `common/config/AsyncConfig` (ver
abajo): el `PATCH …/estado` responde sin esperar al SMTP ni al servicio de
push. Ese método **no abre una transacción**: las llamadas HTTP y SMTP corren
sin retener una conexión a la base, y cada escritura (el registro en
`notificacion`, la desactivación de una suscripción caducada con `save`) es una
transacción corta del repositorio. El `try` envuelve solo el envío: si guardar
el registro falla después de un envío exitoso, se registra el error, pero no
se cuenta como fallo de envío ni dispara el respaldo a correo. Esto se aparta
de ARCHITECTURE.md §4.5 (`REQUIRES_NEW` en los listeners que escriben); la
excepción está planteada en
`project-context/decisions/propuestas/2026-10-20-notificaciones-fuera-de-transaccion.md`.
Timeouts del push: 3 s de conexión y 5 s de pedido
(`PUSH_TIMEOUT_CONEXION_SEGUNDOS`, `PUSH_TIMEOUT_PEDIDO_SEGUNDOS`).

### Executor asíncrono (`AsyncConfig`)

Uno solo, con nombre (`ejecutorAsincrono`, hilos `viasegura-async-*`), para
reutilizar en todo trabajo posterior al commit: los avisos de hoy y la
sugerencia de categoría de D-08 (`@Async(AsyncConfig.EJECUTOR)`). Reemplaza
al `applicationTaskExecutor` de Spring Boot (Boot solo crea el suyo si no hay
ningún `Executor`), así que también es el executor por defecto de cualquier
`@Async` sin nombre.

| Parámetro | Por defecto | Variable |
|---|---|---|
| Hilos base / máximo | 2 / 4 | `ASYNC_HILOS_BASE`, `ASYNC_HILOS_MAX` |
| Cola | 100 tareas | `ASYNC_COLA` |
| Cola llena | **se rechaza** (`TaskRejectedException`): quien encola registra qué se pierde y la descarta | — |
| Apagado | espera hasta 10 s a las tareas en curso | — |

Con la cola llena la tarea **nunca** corre en el hilo que la pidió (no se usa
`CallerRunsPolicy`): eso le devolvería al funcionario la latencia de la red
justo cuando el sistema está saturado. `ReporteEstadoCambiadoListener` atrapa
el rechazo y deja un WARN con el reporte, el ciudadano y el estado del aviso
perdido. Perder un aviso en ese caso se acepta: el reporte y su historial no
dependen de él.

**En los IT** el bean real no existe (`@Profile("!test")`) y
`support/EjecutorSincronoTestConfig` registra uno con el mismo nombre que
corre cada tarea en un hilo nuevo y **espera a que termine**: los IT siguen
siendo deterministas, sin esperas ni `Thread.sleep`. No es un
`SyncTaskExecutor` (mismo hilo) porque en `AFTER_COMMIT` ese hilo todavía
tiene ligada la transacción ya confirmada, y las escrituras «participarían» en
ella sin confirmarse; un hilo aparte reproduce lo que pasa en producción. La
misma clase es el `AsyncConfigurer` del contexto de test: guarda la excepción
que escape de un método `@Async`, y el `@AfterEach` de `AbstractPostgisIT` la
relanza, para que un fallo en el hilo asíncrono haga fallar el test con su
causa.

**Tests.** En todos los IT, `support/EnviadorWebPushFake` reemplaza al puerto
(`@Primary`): registra lo que se habría enviado y responde lo que el test le
indique (entregado, 410, error, sin claves). Ningún test llama a un servicio de
push real. `ZerodepWebPushAdapterTest` prueba el adaptador real sin red: carga
de claves, arranque sin claves, firma y cifrado contra un puerto local cerrado,
y clasificación de respuestas.

## Consentimiento (D-12, NC-07b)

La Ley N.° 29733 de Protección de Datos Personales pide un consentimiento
previo, informado, expreso e inequívoco **para cada finalidad**, y que se pueda
revocar. La tesis, además, tiene que poder mostrar **qué** aceptó cada usuario,
**cuándo** y **qué versión** del texto. Por eso `consentimiento` (V13,
`auth/domain/Consentimiento`) es un **historial**, no un flag en `usuario`:

- cada aceptación es una fila (`usuario_id`, `finalidad`, `version_documento`,
  `aceptado_en`); revocar llena `revocado_en`. Nada se sobrescribe ni se borra;
- finalidades (`FinalidadConsentimiento`): `TERMINOS_Y_PRIVACIDAD`,
  `NOTIFICACIONES_PUSH`, `NOTIFICACIONES_CORREO`;
- **vigente** = la aceptación más reciente sin revocar de esa finalidad y, para
  los términos, de la versión que la app exige hoy
  (`app.legal.version-terminos`, variable `LEGAL_VERSION_TERMINOS`, por defecto
  `2026-10-v1`). Publicar un texto nuevo es cambiar esa propiedad: todos pasan
  a `debeAceptarTerminos=true` sin migrar datos, y la aceptación anterior queda
  en el historial como evidencia.

**Preferencia ≠ permiso.** `usuario.preferencia_notificacion` sigue siendo una
**preferencia** (cómo quiere recibir los avisos: PUSH, EMAIL, AMBAS); el
consentimiento es el **permiso** (si autoriza ese tratamiento). Tampoco el
permiso del navegador para notificaciones reemplaza al consentimiento: es del
dispositivo, no la autorización del titular de los datos.

| Método | Ruta | Respuesta |
|---|---|---|
| POST | `/api/auth/registro` | Exige `aceptaTerminos: true` (ausente o `false` → **400**) y `versionTerminos` igual a la vigente (si no, **409**, y no se crea la cuenta). La fila `TERMINOS_Y_PRIVACIDAD` se crea en la misma transacción. |
| GET | `/api/auth/me/consentimientos` | `versionTerminosVigente`, `debeAceptarTerminos`, `vigentes` (una por finalidad autorizada hoy) e `historial` (todas, de la más reciente a la más antigua, con `vigente` por fila). |
| POST | `/api/auth/me/consentimientos` | `{finalidad, version}`. **201** si deja fila nueva; **200** si ya estaba vigente con esa versión (no duplica el historial). Términos con una versión que no es la vigente → **409**. |
| DELETE | `/api/auth/me/consentimientos/{finalidad}` | **204**, idempotente. `TERMINOS_Y_PRIVACIDAD` → **409**. Finalidad desconocida → 400. |

Cualquier rol autenticado y **solo los propios**: ninguna ruta lleva id de
usuario, así que nadie lee ni revoca los de otro. Sin token, 401.
`UsuarioResponse` (de `/me`, login y registro) suma `debeAceptarTerminos`. Es
un dato del propio usuario, no una señal interna, y ese DTO no lo lee nadie más.

**Usuarios existentes.** La migración no les crea filas: D-12 prohíbe darlos
por aceptados. Reciben `debeAceptarTerminos=true` y el frontend les muestra la
pantalla de aceptación en su próximo inicio de sesión.

**Bloqueo por términos pendientes (decisión del usuario).** Mientras
`debeAceptarTerminos=true`, el backend responde **403** con
`"codigo": "TERMINOS_PENDIENTES"` en el cuerpo de error (`ApiError.codigo`, que
solo aparece cuando lo hay) en **toda ruta privada**, salvo:

- `GET /api/auth/me` (saber quién es y que debe aceptar);
- `/api/auth/me/consentimientos` y `/api/auth/me/consentimientos/{finalidad}`
  (aceptar los términos y, de paso, correo y push);
- `DELETE /api/notificaciones/suscripciones`: es lo único que hace falta para
  cerrar sesión. No hay endpoint de logout (el JWT es stateless y el cliente
  descarta el token), pero la PWA da de baja la suscripción push del navegador
  antes de borrarlo.

Las rutas públicas no cambian, aunque lleguen con el token de un usuario
pendiente: se resuelven antes en `SecurityConfig`. Sin token sigue siendo 401.

*Dónde vive.* En la cadena de seguridad, no en un interceptor de MVC: así
nada de lo que está detrás (controladores, `@PreAuthorize`) llega a correr.
`SecurityConfig` termina con `.anyRequest().access(TerminosAceptadosAuthorizationManager)`,
que exige autenticación **y** términos aceptados; si faltan, marca la petición
y `RestAccessDeniedHandler` arma el 403 con el código. Para no hacer depender a
`common` de un módulo, la pregunta es la interfaz
`common/security/VerificadorTerminosPendientes`, que implementa
`auth/service/ConsentimientoService` (el grafo sigue siendo `common ← auth`).

*Costo.* Una consulta por petición privada (`existeNoRevocadaPorEmail`: un
`EXISTS` por correo, con el índice único de `usuario.email` y el parcial de
`consentimiento`), sin cargar entidades. El filtro JWT ya hace otra para cargar
el usuario. No se cachea: una caché obligaría a invalidarla al aceptar y, con
varias instancias, a compartirla; a esta escala no compensa. Las rutas
públicas no la pagan.

**Los términos no se revocan desde la app (409).** Sin ellos no se puede usar el
servicio; retirarlos equivale a la baja de la cuenta (derecho de cancelación de
la Ley N.° 29733), que es un caso de uso distinto y hoy no existe.

**Revocar `NOTIFICACIONES_PUSH` borra las suscripciones.** `ConsentimientoService`
publica `auth/event/ConsentimientoRevocadoEvent` y
`notificaciones/listener/ConsentimientoRevocadoListener` borra las filas de
`suscripcion_push` del usuario. Así `auth` no conoce a `notificaciones` (el
grafo de módulos sigue sin ciclos). El listener es `AFTER_COMMIT`, como los
demás, y el borrado abre su propia transacción (`REQUIRES_NEW`, §4.5): la
revocación se confirma aunque el borrado falle, porque revocar tiene que ser
simple y no puede depender de otro módulo. Revocar es idempotente y siempre
publica el evento, así que también limpia suscripciones creadas antes de
NC-07b sin consentimiento.

**El permiso manda al enviar.** `NotificacionService.canalDisponible` exige el
consentimiento vigente del canal antes de usarlo: `NOTIFICACIONES_PUSH` para
PUSH y `NOTIFICACIONES_CORREO` para EMAIL. Así una suscripción sin permiso
(anterior a NC-07b, o una que no se llegó a borrar al revocar) queda inerte. La
comprobación está en el servicio y no en `PushNotificacionAdapter` porque un
adaptador (`infra`) no puede llamar a un servicio (regla `capas`), y así vale
para los dos canales en un solo lugar.

**Correo (decisión del usuario).** Los **avisos de cambio de estado** (US-16:
canal EMAIL y el fallback de push a email) solo salen con
`NOTIFICACIONES_CORREO` vigente. Los correos de **seguridad** (recuperar la
contraseña, US-03) y la **respuesta de soporte** (US-25, la pidió el usuario)
se envían siempre: usan `JavaMailSender` directo y no pasan por
`NotificacionService`. Si el usuario no autoriza ningún canal, cada intento se
registra `FALLIDA`, como un canal no disponible, sin error: el cambio de estado
se confirma igual.

> **Consecuencia:** los usuarios existentes y los que se registren sin aceptar
> correo **dejan de recibir avisos por correo** hasta que acepten
> `NOTIFICACIONES_CORREO`. La pantalla de aceptación del frontend ofrece correo
> y push junto con los términos.

**Doble aceptación simultánea (V14).** Un índice único parcial
`(usuario_id, finalidad, version_documento) WHERE revocado_en IS NULL` y un
`INSERT … ON CONFLICT … DO NOTHING RETURNING id`: si dos POST iguales llegan a
la vez, el segundo espera al primero, no inserta y responde 200. Una versión
revocada y aceptada otra vez sí deja fila nueva. Va en V14 porque V13 ya estaba
aplicada.

## Municipalidades y periodo de gestión (NC-01)

**Una municipalidad por distrito (D-09).** `municipalidad.distrito_id` es
`NOT NULL UNIQUE` y la geometría sigue solo en `distrito`. El reporte obtiene
su distrito por punto en polígono y de ahí su municipalidad
(`MunicipalidadService#deDistrito`). Son 43: 42 distritales más la
Municipalidad Metropolitana de Lima, que gestiona Cercado de Lima (el
distrito «Lima»). `correo_contacto` admite nulo: el seed no inventa canales
oficiales.

**Por qué el seed de municipalidades no es una migración.** Los distritos no
los carga Flyway: los carga `DistritoSeeder`, un `ApplicationRunner` que corre
*después* de las migraciones. En una base vacía, como la de un IT o un
despliegue nuevo, una migración con `INSERT … SELECT FROM distrito` no
encontraría distritos y sembraría cero filas sin avisar. Por eso las siembra
`municipalidades/infra/MunicipalidadSeeder` (`@Order(2)`, después de
`DistritoSeeder`, que tiene `@Order(1)`). Es idempotente: solo crea las
municipalidades de los distritos que todavía no tienen una. Verificado en una
base vacía: todas las migraciones, después 43 distritos y después 43 municipalidades.

**Excepción deliberada: el seeder lee la tabla `distrito` con SQL nativo.** Un
`infra` no puede usar el repositorio de otro módulo (§4.3,
`soloApiPublicaDeOtrosModulos`) ni un `service` (regla `capas`: a la
aplicación solo entra la presentación). Es el mismo cruce que obligó a mover la
asignación geo en BE-06. La alternativa sería mover el seed a un servicio que se
llame desde algún arranque fuera de `infra`, y eso no tiene lugar en las capas.
Por eso lee la tabla con una consulta nativa de su propio repositorio
(`MunicipalidadRepository#distritosSinMunicipalidad`). La dependencia ya existe
en el esquema por la FK `municipalidad.distrito_id`, y ArchUnit no la ve porque
es SQL.

**Periodo de gestión.** `periodo_gestion` (fechas inclusivas) se siembra en la
misma V15 con 2023-01-01 → 2026-12-31, porque no depende de otro dato.
La restricción `EXCLUDE USING gist` sobre `daterange(fecha_inicio, fecha_fin, '[]')`
de V16 impide que dos periodos se solapen. Así, cada fecha cae en un solo periodo.
`MunicipalidadService#periodoVigente(fecha)` devuelve el periodo que contiene
la fecha, o vacío fuera de todo periodo. Un reporte contará en el periodo de
su fecha de creación (NC-02).

**Pendiente.** GESTION_MUNICIPAL y REQUISITO_RECEPCION no se crean todavía:
sus columnas no están definidas. Según la propuesta
`project-context/decisions/propuestas/2026-10-20-columnas-gestion-y-requisitos.md`
(aceptada, opción A), se crean con NC-06 y NC-05.

## Título, severidad y periodo del reporte (NC-02)

**Qué agrega.** `reporte` suma `titulo` (5–120 caracteres Unicode tras el trim, se
guarda recortado), `severidad` (`BAJA < MEDIA < ALTA`) y `periodo_gestion_id`.
El ciudadano fija título y severidad al crear y puede cambiarlos mientras el
reporte está `PENDIENTE` (US-08), igual que la descripción. El funcionario los
ve en la bandeja, pero ningún endpoint de gestión los edita.

**La severidad es pública y no es una señal interna.** Va en
`ReporteResumenResponse`, que leen también los anónimos. No contradice la regla
de los DTO públicos: es un dato que *declara el ciudadano*, como la descripción
o la foto. No sale de un detector y no es una prioridad que fije la
municipalidad. Si algún día existe una severidad evaluada por el funcionario, o
un puntaje de priorización, irá en un campo aparte y solo en la bandeja.

**El periodo no se expone.** `periodo_gestion_id` lo asigna el servicio al
crear, con `MunicipalidadService#periodoVigente` sobre la fecha de creación en
hora de Lima. Fuera de todo periodo queda nulo. Lo usará el dashboard por
periodo (NC-06); hoy no está en ningún DTO.

**La idempotencia va antes que la validación.** En el controller, `titulo` y
`severidad` son `@RequestParam(required = false)`. `ReporteService.crear`
busca primero la `Idempotency-Key` y solo después los valida. Así, la cola
offline (US-06) puede reenviar un reporte que llegó al backend *antes* de NC-02:
con su clave ya registrada recibe la respuesta original y no un 400 por campos
que su versión no conocía. Con una clave nueva, o sin clave, la falta de
cualquiera de los dos da 400 y la clave no se registra, así que el cliente
puede completar los datos y reenviar con la misma clave. `IdempotenciaReporteIT`
cubre los dos caminos.

**Migración V17 con datos.** Las columnas se agregan nulables, se rellenan y
recién después pasan a `NOT NULL` con sus `CHECK`, así que la migración
funciona sobre una base que ya tiene reportes. El relleno es este:

- **`titulo`:** «&lt;categoría&gt; en &lt;distrito&gt;»; si el reporte no tiene
  distrito, «Lima Metropolitana».
- **`severidad`:** `MEDIA`.
- **`periodo_gestion_id`:** el periodo de su `created_at`.

El distrito se lee con una subconsulta porque en un `UPDATE … FROM` el `JOIN`
del `FROM` no puede referirse a la tabla actualizada. La primera versión de V17
fallaba justamente por eso; nunca llegó a aplicarse.

Verificado en una copia de la base de desarrollo con 15 reportes: títulos
como «Bache en Miraflores», severidad `MEDIA` y todos con periodo. También
verificado en una base de test vacía.

## Deuda técnica conocida

- **Testcontainers bloqueado por Docker 29 / docker-java 1.20.x.** Los tests
  de integración (`*IT`) deberían usar Testcontainers para levantar un PostGIS
  efímero. En este entorno no funciona: Docker Desktop es bleeding-edge
  (API **1.54**, Docker 29) y el `docker-java` que trae Testcontainers 1.20.x
  (BOM de Spring Boot 3.4) recibe **HTTP 400** del proxy `docker_cli` en todos
  los named pipes (`docker_engine`, `dockerDesktopLinuxEngine`), aunque el CLI
  de Docker sí funciona porque negocia la versión de API.
  - **Workaround actual:** los tests corren contra una base dedicada
    `viasegura_test` en el **mismo contenedor PostGIS** de desarrollo
    (`viasegura-db`, puerto 5433), configurada en
    `src/test/java/.../support/AbstractPostgisIT.java` vía `@DynamicPropertySource`
    (overridable con `TEST_DB_URL`/`TEST_DB_USER`/`TEST_DB_PASSWORD`).
    Sigue siendo PostGIS real (geography/GiST), aislado por nombre de base.
  - **Prerequisito para correr tests:** `docker compose up -d` y crear la base
    una vez: `docker exec viasegura-db psql -U viasegura -d viasegura -c "CREATE DATABASE viasegura_test;"`.
  - **A revertir cuando:** Testcontainers publique una versión con `docker-java`
    compatible con Docker 29 (o se fije `<testcontainers.version>` a una que lo
    soporte). La migración es local a `AbstractPostgisIT` — el resto de los
    tests no cambia.
- **Almacenamiento de fotos en filesystem local** (`LocalFotoStorageService`):
  adecuado para desarrollo/academia; para producción migrar a S3-compatible
  implementando `FotoStorageService` (la lógica de negocio no cambia). Si la
  transacción de BD falla tras escribir el archivo, queda una foto huérfana en
  disco (aceptable en MVP).
- **Dataset de distritos simplificado** (5,130 vértices, IGN/INEI): margen de
  error medido ≈ metros (≤ ~20 m en bordes terrestres; 0.044 % de mala
  asignación sobre 20k puntos). Suficiente para el MVP. El dataset detallado
  (66,753 vértices) está disponible si se requiere mayor precisión; el
  `DistritoSeeder` es agnóstico al archivo.
- **Densidad del mapa de calor (US-11) sin caché en el servidor ni tope de
  celdas.** Cada petición que no resuelve la caché HTTP agrega toda la tabla
  `reporte` con los filtros dados, y la respuesta crece con las celdas
  ocupadas. Siguiente paso, si el volumen lo pide: una vista materializada
  por celda refrescada por eventos, como `mv_indice_desempeno_distrital`
  (ver [Mapa de calor (US-11)](#mapa-de-calor-us-11)).

## Modelo de datos

12 entidades con soporte geoespacial en `distrito.limites`
(`GEOGRAPHY(MultiPolygon,4326)`) y `reporte.ubicacion`
(`GEOGRAPHY(Point,4326)`), ambas con índice **GiST**. Ver
`src/main/resources/db/migration/V1__init_schema.sql`. Las migraciones
posteriores agregan tablas propias, como `suscripcion_push` (V12, NC-07),
`consentimiento` (V13 y V14, NC-07b) y `municipalidad` y `periodo_gestion`
(V15 y V16, NC-01).

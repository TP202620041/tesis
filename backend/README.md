# ViaSegura — Backend

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

- `local` (por defecto) — apunta al Postgres de `docker-compose.yml`.
- `dev` — entorno compartido; toda la configuración por variables de entorno
  (`DB_URL`, `DB_USERNAME`, `DB_PASSWORD`, `JWT_SECRET`).

Activar otro perfil: `SPRING_PROFILES_ACTIVE=dev mvn spring-boot:run`.

## Endpoints implementados (vertical slice inicial)

| Método | Ruta                | Auth | Historia | Descripción |
|--------|---------------------|------|----------|-------------|
| POST   | `/api/auth/registro`| No   | US-01    | Registrar cuenta ciudadana |
| POST   | `/api/auth/login`   | No   | US-02    | Iniciar sesión (devuelve JWT) |
| GET    | `/api/auth/me`      | Sí   | US-02    | Datos del usuario autenticado |

### Ejemplo rápido

```bash
# Registro
curl -X POST http://localhost:8080/api/auth/registro \
  -H "Content-Type: application/json" \
  -d '{"email":"vecino@lima.pe","password":"secreta123","nombre":"Ana","apellido":"Ruiz"}'

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
- **Strategy** para la asignación geoespacial de distrito (`reportes/port/` +
  `reportes/infra/`) y para el envío multicanal de notificaciones
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

## Catálogos de referencia (descubribilidad)

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
necesitar los polígonos (p. ej. el mapa de calor de US-11, pospuesto), eso
amerita un endpoint propio con GeoJSON y su política de caché.

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

## Modelo de datos

12 entidades con soporte geoespacial en `distrito.limites`
(`GEOGRAPHY(MultiPolygon,4326)`) y `reporte.ubicacion`
(`GEOGRAPHY(Point,4326)`), ambas con índice **GiST**. Ver
`src/main/resources/db/migration/V1__init_schema.sql`.

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
| `FOTOS_ALMACEN` | sí | `s3` (fotos en Cloudflare R2) o `local` (disco del contenedor). Sin ella no arranca: con el `local` de desarrollo por defecto, cada despliegue borraría las fotos sin avisar (ver [Fotos](#fotos-dos-visibilidades-dos-buckets-y-sin-exif-dep-12)). Con otro valor tampoco: `common/config/ValidacionAlmacenDeFotos` lo rechaza antes de crear ningún bean, con un mensaje que nombra la variable y los valores admitidos (sin ella, el error era un genérico «No qualifying bean of type FotoStorageService»). |
| `FOTOS_S3_ENDPOINT` | con `s3` | `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`. |
| `FOTOS_S3_REGION` | no (`auto`) | R2 la ignora, pero el SDK exige una. |
| `FOTOS_S3_BUCKET_REPORTES`, `FOTOS_S3_BUCKET_PERFILES` | con `s3` | Dos buckets privados y **distintos** (no arranca si coinciden). |
| `FOTOS_S3_ACCESS_KEY_ID`, `FOTOS_S3_SECRET_ACCESS_KEY` | con `s3` | Token de R2 con *Object Read & Write* limitado a esos dos buckets. |
| `FOTOS_DIR` | con `local` | Directorio de las fotos. La imagen ya trae `FOTOS_DIR=/data/fotos`. |
| `FOTOS_SANEADO_MAX_CONCURRENTES` | no (2) | Saneados de fotos simultáneos; con `-Xmx512m`, 2. **No bajar de 2**: la vista previa de NC-04 toma como máximo un turno, y la garantía de que siempre quede otro para las creaciones depende de que haya al menos dos. |
| `CORREO_TIPO` | sí | `resend` (el plan de Railway bloquea el SMTP saliente); `smtp` solo en local y en los tests. Sin ella no arranca (DEP-08, ver «Correo saliente»). Con otro valor tampoco: `common/config/ValidacionCorreoSaliente` lo rechaza antes de crear ningún bean, con un mensaje que nombra la variable y los valores admitidos. |
| `NOTIF_FROM` | sí | Remitente de todos los correos: `Ciudad Viva <no-reply@<dominio verificado en Resend>>`. Sin ella no arranca. |
| `CORREO_API_KEY` | con `CORREO_TIPO=resend` | Clave de la API de Resend (secreto). Sin ella el adaptador no arranca. |
| `CAPTCHA_TIPO` | sí | Captcha del registro de cuenta (NC-08): `turnstile` (Cloudflare Turnstile, desde NC-08b) o `ninguno` (no se exige). Sin ella no arranca: con el `ninguno` de desarrollo, un despliegue que la olvidara dejaría el registro sin captcha sin que nada lo advierta. Con otro valor tampoco: `auth/infra/ValidacionTipoCaptcha` lo rechaza antes de crear ningún bean; `recaptcha`, el valor de NC-08 hasta el 28/10, ya no existe y el mensaje lo dice (ver «Captcha en el registro»). |
| `CAPTCHA_SECRET` | con `CAPTCHA_TIPO=turnstile` | Clave secreta del widget de Turnstile en el panel de Cloudflare (secreto). Sin ella el adaptador no arranca. La clave del sitio (pública) la usa el frontend, no el backend. |
| `CAPTCHA_HOSTNAMES` | no (`ciudadviva.app,www.ciudadviva.app` en `prod`) | Hostnames donde puede resolverse el widget, separados por coma, sin esquema ni puerto: un token aprobado en otro es 409. Con valor por defecto **a propósito**, el de la PWA en producción; solo hace falta si la PWA se sirve en otro dominio. Vacía, no se compara (es lo que pasa fuera de `prod`, donde las claves de prueba responden `example.com`). Una entrada que no es un hostname no arranca. |
| `DOMINIO_CORREO_TIPO` | no (`dns` en `prod`) | Verificación del dominio del correo al registrarse (NC-09): `dns` consulta el MX; `ninguno` la apaga (la lista de desechables se aplica igual). Con valor por defecto **a propósito**: no es una variable obligatoria nueva, porque `dns` no necesita ninguna clave y falla abierto si el DNS no responde. Otro valor no arranca (`auth/infra/ValidacionTipoDominioCorreo`). Ver «Confirmación del correo». |
| `FRONTEND_URL` | no (el primer origen de `CORS_ALLOWED_ORIGINS`) | Origen de la PWA para el enlace de confirmación (`<origen>/confirmar-cuenta?token=…`), sin ruta. Sin ella se usa el primer origen de `CORS_ALLOWED_ORIGINS`, que es el de la PWA (`https://ciudadviva.app`); solo hace falta si ese primer origen no lo es (por ejemplo, si la lista empieza por `https://www.…`: funcionaría por la redirección 308, pero con un salto de más). Una URL que no es un origen `http(s)` no arranca. |
| `PORT` | no (8080) | Lo inyecta la plataforma. |
| `CUENTAS_SIN_CONFIRMAR_PLAZO` | no (`30d`) | Edad a partir de la cual se borra una cuenta que nunca confirmó su correo (BE-15). Duración de Spring (`30d`, `720h`); menos de 1 día no arranca. Ver [Purga de cuentas sin confirmar](#purga-de-cuentas-sin-confirmar-be-15). |
| `CUENTAS_SIN_CONFIRMAR_PURGA_CRON` | no (`0 30 3 * * *`) | Cuándo corre esa purga: expresión cron de Spring (segundo, minuto, hora, día, mes, día de la semana) en hora de Lima; por defecto, todos los días a las 03:30. `-` la apaga. |
| `SPRINGDOC_HABILITADO` | no (`false`) | `true` publica `/v3/api-docs` y Swagger UI. |
| `ADMIN_INICIAL_EMAIL`, `ADMIN_INICIAL_PASSWORD`, `ADMIN_INICIAL_NOMBRE` | solo en el primer arranque | Crean el primer ADMIN en una base sin ninguno. Después se borra `ADMIN_INICIAL_PASSWORD`; las otras dos pueden quedar (ver «Operación en producción»). |
| `CLASIFICACION_TIPO` | sí | Adaptador del clasificador de fotos (NC-04b): `http` (el servicio `inferencia/` por la red privada) en el despliegue. `falso` es el **interruptor** para apagar la clasificación: en `prod` el falso responde siempre «sin detecciones» (`application-prod.yml`, literal) y no escribe nada. Sin ella no arranca: con el `falso` de desarrollo por defecto la clasificación quedaría apagada sin que nada lo advierta, porque cualquier falla del adaptador también termina en «sin sugerencia». Otro valor tampoco arranca (`clasificacion/infra/ValidacionTipoClasificador`). Ver [Sugerencia de categoría](#sugerencia-de-categoría-por-la-foto-nc-04-fase-0). |
| `CLASIFICACION_URL` | con `CLASIFICACION_TIPO=http` | URL base del servicio de inferencia, sin la ruta: `http://${{inferencia.RAILWAY_PRIVATE_DOMAIN}}:8000` en Railway. Sin ella, sin esquema `http(s)` y host, o con ruta (`…:8000/v1`), query, fragmento o usuario, no arranca: el adaptador agrega `/v1/detecciones`, y una ruta de más daría un 404 en cada llamada que solo se vería en el log. No es un secreto. |
| `CLASIFICACION_UMBRAL` | no (`0.50`) | Confianza mínima para sugerir, en (0, 1]. Se calibra en NC-03b. |
| `CLASIFICACION_ESPERA_TURNO_MS` | no (`10000`) | Cuánto espera la sugerencia oficial un turno del servicio de inferencia (NC-04c), entre 0 y 60000 ms; fuera de rango no arranca. La vista previa nunca espera. |
| `MODERACION_TIPO` | sí | Moderación de la foto antes de publicarla (NC-10b, D-15): `http` (`POST /v1/moderacion` del servicio `inferencia/`) en el despliegue. Con `http`, si el servicio no responde, un reporte con foto recibe **503 `MODERACION_NO_DISPONIBLE`** (falla cerrada). `ninguna` es el **interruptor de emergencia** ante una caída larga: mientras está puesto **se publican fotos sin revisar**, y cada arranque deja un WARN. Sin ella no arranca: con el `ninguna` de desarrollo por defecto, un despliegue que la olvidara publicaría fotos sin revisar sin que nada lo advierta. Otro valor tampoco arranca (`moderacion/infra/ValidacionTipoModeracion`). **Se despliega con `http` solo después del servicio con el modelo de moderación** (DEP-13, NC-10a). Ver [Moderación de contenido](#moderación-de-contenido-nc-10b-d-15). |
| `MODERACION_URL` | con `MODERACION_TIPO=http` | URL base del servicio de inferencia, sin la ruta; la misma que `CLASIFICACION_URL`. Las mismas reglas: sin ella, sin esquema `http(s)` y host, o con ruta, query, fragmento o usuario, no arranca (el adaptador agrega `/v1/moderacion`). No es un secreto. |
| `MODERACION_UMBRAL` | no (`0.70`) | Se rechaza la foto si el puntaje es mayor o igual. Entre 0.5 y 0.9 (con punto decimal); fuera de rango o no numérico, no arranca. 0.70 es la decisión del usuario del 28/10; la calibración de NC-10a sugiere mantenerlo hasta medir fotos de calles con gente. |
| `ORIGEN_SECRETO` | sí | El secreto que la *Transform Rule* de Cloudflare agrega en `X-Origen-Secreto` (DEP-14): sin ese encabezado, toda petición recibe 403, salvo `GET /actuator/health`. 32 caracteres ASCII visibles o más (`openssl rand -hex 32`); el mismo valor va en Cloudflare. Sin ella no arranca: con el `ninguno` de desarrollo por defecto, el API volvería a atender las peticiones que se saltan Cloudflare sin que nada lo advierta. Vacía, más corta o con espacios, tampoco. `ninguno` es el **interruptor** para apagarlo a propósito (deja un WARN en cada arranque). Ver [Encabezado de origen](#encabezado-de-origen-dep-14). |
| `ORIGEN_SECRETO_ANTERIOR` | solo durante una rotación | El secreto viejo, que se sigue aceptando mientras Cloudflare pasa al nuevo. Fuera de una rotación, vacía; si queda puesta, cada arranque deja un WARN. Igual a `ORIGEN_SECRETO`, o débil, no arranca. |
| `JWT_EXPIRATION_MINUTES`, `VAPID_*`, `PUSH_*`, `MAIL_*` (solo con `smtp`), `LEGAL_VERSION_TERMINOS`, `ASYNC_*` | no | Las mismas de `application.yml`, con sus valores por defecto. |

### Qué cambia respecto de `local`

- **Errores.** `server.error.include-message` e `include-stacktrace` en
  `never`. Solo afectan al `/error` de Spring Boot, que responde lo que no
  pasa por `GlobalExceptionHandler` (un rechazo del firewall de Spring
  Security, un fallo en un filtro). Los `ApiError` de `GlobalExceptionHandler`
  conservan su `message`, que es el que muestra el frontend
  (`frontend/src/lib/api/errors.ts`); `PerfilProdIT` lo comprueba con un 409
  conocido.
- **OpenAPI y Swagger UI** apagados salvo `SPRINGDOC_HABILITADO=true`: la
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
- **Solo lo que pasa por Cloudflare** (DEP-14): sin el encabezado de origen
  con el secreto de `ORIGEN_SECRETO`, 403 en cualquier ruta salvo
  `GET /actuator/health`. Fuera de `prod` está apagado. Ver
  [Encabezado de origen](#encabezado-de-origen-dep-14).
- **Apagado ordenado** (`server.shutdown: graceful`): en un redespliegue
  terminan las peticiones en curso.
- **Logs** en `INFO` y sin el SQL de Hibernate.

### Healthcheck y tiempos de espera (todos los perfiles)

- **Actuator** expone solo `GET /actuator/health`, pública y exacta en
  `SecurityConfig`, y responde únicamente `{"status":"UP"}`: sin detalles ni
  componentes que revelen la base o las versiones. Ningún otro endpoint de
  Actuator se expone por web, ni siquiera a un ADMIN (`/actuator/env` o
  `/actuator/heapdump` entregarían el secreto JWT y la contraseña de la base).
  Lo prueba `ActuatorHealthIT`. En `prod` es además la única ruta que no
  exige el encabezado de origen (DEP-14): el health check de Railway entra
  directo, sin pasar por Cloudflare.
- El health **no incluye el correo** (`management.health.mail.enabled:
  false`): un SMTP caído afecta a cada envío, no a la API, y no debe marcarla
  como caída ni hacer fallar un despliegue. La base de datos sí cuenta: sin
  ella la API no sirve.
- **Correo con timeouts**: SMTP con 5 s en conexión, lectura y escritura
  (JavaMail espera indefinidamente por defecto) y Resend con 3 s de conexión
  y 10 s de lectura. Desde DEP-08 ningún correo se envía dentro de una
  petición: un proveedor lento ocupa un hilo del executor asíncrono, no la
  respuesta al usuario ni una conexión de la base.
- **Inferencia con timeouts** (NC-04b): 0,5 s de conexión y 2,5 s de lectura,
  3 s en total, y nunca con una conexión de la base tomada. El health **no
  incluye la inferencia**: un servicio de inferencia caído deja los reportes
  sin sugerencia, no deja sin API, y no debe marcarla como caída ni hacer
  fallar un despliegue.

### Imagen (`backend/Dockerfile`)

```bash
docker build -t viasegura-backend backend/
docker run -p 8080:8080 -e JWT_SECRET=… -e DB_URL=… -e DB_USERNAME=… \
  -e DB_PASSWORD=… -e CORS_ALLOWED_ORIGINS=… \
  -e FOTOS_ALMACEN=s3 -e FOTOS_S3_ENDPOINT=… -e FOTOS_S3_BUCKET_REPORTES=… \
  -e FOTOS_S3_BUCKET_PERFILES=… -e FOTOS_S3_ACCESS_KEY_ID=… \
  -e FOTOS_S3_SECRET_ACCESS_KEY=… viasegura-backend
```

- **Dos etapas.** `maven:3.9-eclipse-temurin-21` compila: primero
  `dependency:go-offline` solo con el `pom.xml`, en su propia capa (un cambio
  en `src/` no vuelve a descargar las dependencias; un cambio en el `pom.xml`
  sí), luego `package -DskipTests` y la extracción por capas de Spring Boot
  (`java -Djarmode=tools -jar … extract --layers`). Los tests no corren en el
  build porque necesitan la base de test y GreenMail; ya corrieron con
  `mvn clean verify` antes de fusionar.
- **Ejecución en `eclipse-temurin:21-jre-noble`, no Alpine.** La exportación
  XLSX (US-28) usa `autoSizeColumn` de Apache POI, que mide el texto con
  fuentes reales. Esta imagen ya trae fontconfig y DejaVu (`fc-list`), así
  que no hace falta instalar nada.
- **Capas de Spring Boot** copiadas de la que menos cambia a la que más
  (dependencias, cargador, *snapshots*, aplicación): un cambio de código solo
  reemplaza la última.
- **Usuario sin privilegios** `viasegura` (uid 999), dueño de `/data/fotos`.
- **Variables de la imagen:** `SPRING_PROFILES_ACTIVE=prod` (sin ella `local`
  llegaría por defecto; ver SEC-03), `FOTOS_DIR=/data/fotos` y
  `JAVA_TOOL_OPTIONS="-XX:MaxRAMPercentage=75 -Djava.awt.headless=true"`
  (heap al 75 % de la memoria del contenedor; POI usa AWT sin pantalla). Si
  la plataforma define su propio `JAVA_TOOL_OPTIONS` (el runbook fija el heap
  con `-Xmx`), reemplaza este entero; por eso `-Djava.awt.headless=true` va
  también en el `ENTRYPOINT`.
- `.dockerignore` deja fuera `target/`, `uploads/`, los logs, los archivos del
  IDE y `.env`, para que un archivo con secretos nunca llegue al contexto de
  build.

**Tamaño (2026-10-22, con DEP-12): 399,7 MB** sin comprimir (381,2 MiB; la
suma de las capas de `docker history`: Ubuntu 87,6 MB, paquetes de Temurin
49,4 MB, JRE 166 MB, dependencias 96,3 MB, código 0,4 MB) y **186 MB
comprimida** (la columna *CONTENT SIZE* de `docker image ls`, lo que se
descarga). El criterio de DEP-03 pide menos de 400 MB: se cumple, **sin
margen**. Antes de DEP-12 eran 391 MB; el SDK de S3 y los lectores de
TwelveMonkeys suman unos 9 MB, aun usando solo el módulo `s3` del SDK con el
cliente HTTP de `URLConnection` (sin Apache HttpClient, Netty, CRT ni firma
de *event streams*) y quitando `tomcat-embed-websocket`, que la API no usa.
Con esas exclusiones la primera medición (400,07 MB) bajó a 399,7 MB. La
próxima dependencia pasará el límite: si importa, la salida de fondo es un
JRE propio con `jlink` (unos 80 MB menos) o medir el criterio sobre la imagen
comprimida. La columna *DISK USAGE* de Docker Desktop
(586 MB) suma la imagen comprimida y la descomprimida, así que no es el
tamaño de la imagen.

**Con DEP-08 (2026-10-22): 399,75 MB** sin comprimir (399.749.120 bytes,
381,23 MiB; la suma exacta de `docker history --human=false`) y 186 MB
comprimida. DEP-08 no suma dependencias: el correo por HTTP usa el
`RestClient` de Spring y el `HttpClient` del JDK, sin el SDK de Resend, y su
código agrega unos 29 KB a la capa de la aplicación (0,45 MB). El criterio se
sigue cumpliendo, con unos 250 KB de margen.

**Verificación (2026-10-21)**, con la imagen contra un PostGIS 16-3.4 vacío y
temporal:

- Aplica V1–V17, siembra 43 distritos y 43 municipalidades, arranca en unos
  8 s y `GET /actuator/health` responde `{"status":"UP"}`.
- Sin `JWT_SECRET`, o con el secreto de desarrollo, no arranca, con el mensaje
  de `JwtService` y antes de tocar la base. Sin `CORS_ALLOWED_ORIGINS` no
  arranca (`Could not resolve placeholder`), aunque después de migrar. Sin
  `DB_URL` tampoco, pero el mensaje es de Hikari y poco claro
  (`URL must start with 'jdbc'`).
- `/v3/api-docs` y `/swagger-ui.html` responden 404; `/actuator/env` y
  `/actuator/heapdump`, 401. El preflight de CORS acepta el origen
  configurado y rechaza otro (403).
- Un ciudadano crea un reporte con foto (se escribe en `/data/fotos` con el
  uid 999 y se sirve pública) y una funcionaria, creada con SQL, exporta el
  XLSX: 200, `reportes-miraflores.xlsx`, con los anchos de columna calculados.
- `docker stop` termina con "Graceful shutdown complete".

### Railway

La configuración del servicio (ruta raíz `backend/`, construcción con el
`Dockerfile`, health check en `/actuator/health` y variables) se fija **en el
panel de Railway**, no en un `railway.toml`: Railway deprecó la configuración
como código. El paso a paso está en el runbook de despliegue
(`docs/despliegue.md`). Dos puntos que dependen de este backend:

- **Health check.** `GET /actuator/health` responde `UP` en cuanto Tomcat
  arranca; los *seeders* de distritos y municipalidades terminan alrededor de
  un segundo después (solo hacen algo en el primer despliegue).
- **Correo (DEP-08).** El plan de Railway bloquea el SMTP saliente:
  `CORREO_TIPO=resend`, `CORREO_API_KEY` y un `NOTIF_FROM` de un dominio
  verificado en Resend (ver «Correo saliente»).
- **Fotos en R2, sin volumen (DEP-12).** Con `FOTOS_ALMACEN=s3` las fotos
  van a Cloudflare R2 y el contenedor no escribe en disco: no hace falta un
  volumen ni, por lo tanto, `RAILWAY_RUN_UID=0`, y la imagen corre con su
  usuario sin privilegios. Esa variable solo vuelve a hacer falta con
  `FOTOS_ALMACEN=local` y un volumen en `/data/fotos`: Railway monta los
  volúmenes como `root`, la imagen corre como `viasegura`, y
  `RAILWAY_RUN_UID=0` **hace correr el contenedor como root**. Es la salida
  de emergencia si R2 no estuviera disponible, no la configuración normal.
- **Encabezado de origen (DEP-14).** El health check entra directo al
  contenedor, sin pasar por Cloudflare: por eso `GET /actuator/health` es la
  única ruta que no exige `X-Origen-Secreto` (ver la sección siguiente).

## Encabezado de origen (DEP-14)

**El problema (SEC-05).** `api.ciudadviva.app` va con el proxy de
Cloudflare: el WAF, la regla «solo rutas de la app» y el límite de
peticiones de escritura (runbook, §11.1). Pero el borde de Railway enruta
por el `Host`: una petición con `Host: api.ciudadviva.app` enviada directo a
la IP de Railway llegaba al backend sin pasar por ninguna de esas defensas
(comprobado el 28/10: 200 en `/api/categorias`). Borrar el dominio
`*.up.railway.app` (25/10) no lo cerraba, y el backend no limita por IP.

**La solución** es la «HTTP Header Validation» que recomienda Cloudflare
([Protect your origin server](https://developers.cloudflare.com/fundamentals/security/protect-your-origin-server/)):

1. Una *Request Header Transform Rule* de Cloudflare agrega
   `X-Origen-Secreto: <secreto>` a cada petición hacia
   `api.ciudadviva.app`. Es *Set static*: si el cliente manda su propio
   `X-Origen-Secreto`, Cloudflare lo reemplaza.
2. `common/security/EncabezadoDeOrigenFilter` responde 403 a toda petición
   que no lo traiga con ese valor.

Las decisiones:

- **Va con la máxima precedencia, antes que Spring Security.**
  `EncabezadoDeOrigenConfig` lo registra con un `FilterRegistrationBean` de
  orden `Ordered.HIGHEST_PRECEDENCE`, antes que Spring Security (−100). Una
  petición rechazada no llega a CORS, al JWT ni a ningún controlador. Empata
  con el `CharacterEncodingFilter` y el `ForwardedHeaderFilter` de Spring
  Boot, que pueden correr antes sin cambiar lo que mira: la ruta exenta se
  compara contra el *context path* más la ruta, que ese filtro cambia en
  conjunto si aplica un `X-Forwarded-Prefix`. No es un `@Component`, para no
  quedar registrado dos veces.
- **El 403 no da pistas.** Es el mismo `ApiError` «Acceso denegado» de
  cualquier 403 de la cadena de seguridad, igual sin el encabezado que con un
  valor equivocado: no dice qué falta ni cómo se llama.
- **Nunca se registra el secreto.** Ni el valor recibido ni el esperado
  aparecen en el log (un rechazo deja, en DEBUG, solo el método y la ruta), y
  los mensajes de un arranque fallido nombran la variable y la regla, nunca
  el valor ni su longitud.
- **Comparación en tiempo constante.** `MessageDigest.isEqual` sobre los
  bytes, con el secreto como primer argumento: en el JDK 21, la duración
  depende solo de la longitud de ese argumento, no de cuántos bytes
  coinciden. Durante una rotación compara siempre con los dos secretos, sin
  cortocircuito.
- **Única excepción: `GET /actuator/health`, exacta.** El health check de
  Railway entra directo al contenedor, sin pasar por Cloudflare, y solo
  responde `{"status":"UP"}`. Se compara la URI cruda, así que `HEAD`,
  `/actuator/health/db`, `/actuator/health/` o `/actuator/%68ealth` exigen el
  encabezado. Ninguna otra ruta queda exenta: el preflight CORS (`OPTIONS`) y
  las fotos de `/media/fotos/reportes/**` también pasan por Cloudflare, y la
  regla agrega el encabezado a toda petición al host.
- **No autentica a nadie.** Solo prueba que la petición pasó por el proxy.
  Detrás siguen el JWT, los roles y la autorización por instancia.

**Configuración.**

| Propiedad | Variable | Valor |
|---|---|---|
| `app.origen.secreto` | `ORIGEN_SECRETO` | Obligatoria en `prod`, sin valor por defecto. `ninguno` lo apaga. Fuera de `prod` vale `ninguno` por defecto, y en los tests es `ninguno` literal. |
| `app.origen.secreto-anterior` | `ORIGEN_SECRETO_ANTERIOR` | Solo durante una rotación; si no, vacía. |
| `app.origen.encabezado` | — | `X-Origen-Secreto`, fijo en `application.yml`. No es secreto. |

- **Sin `ORIGEN_SECRETO`, `prod` no arranca**, igual que con `CAPTCHA_TIPO` o
  `CLASIFICACION_TIPO`. Con el `ninguno` de desarrollo por defecto, un
  despliegue que olvidara la variable volvería a atender las peticiones que
  se saltan Cloudflare sin que nada lo advierta. Falla al leer la
  configuración, antes de crear ningún bean.
- **Un secreto débil tampoco arranca.** Se rechaza si está vacío, si tiene
  menos de 32 caracteres o si lleva caracteres que no son ASCII visibles
  (espacios, saltos de línea, letras con tilde). Esos caracteres se pierden al
  pegar el valor o al enviarlo en un encabezado, y el API respondería 403 a
  todo. El arranque falla al construir el filtro, junto con el servidor web y
  antes de conectarse a la base. El secreto se genera con
  `openssl rand -hex 32`: 64 caracteres hexadecimales, 256 bits.
- **El interruptor `ORIGEN_SECRETO=ninguno`.** Sigue el estilo de
  `CAPTCHA_TIPO=ninguno` y `CLASIFICACION_TIPO=falso`: no distingue
  mayúsculas ni recorta espacios, así que `ninguno ` es un secreto corto y no
  arranca. Existe para un caso concreto: si hubiera que quitar el proxy de
  Cloudflare (nube gris) durante un incidente, el encabezado dejaría de
  llegar y el API respondería 403 a todo. Sin el interruptor, la única salida
  sería un cambio de código. En `prod` deja un WARN en cada arranque. Hay que
  escribirlo a propósito, porque no es el valor por defecto.
- **Rotación sin corte**, con `ORIGEN_SECRETO_ANTERIOR`. Con un solo secreto,
  rotar cortaría el servicio: desde que Railway activa la versión con el
  secreto nuevo hasta que se guarda la regla en Cloudflare, todo daría 403.
  Con la variable, el filtro acepta los dos secretos mientras Cloudflare
  cambia de valor; el paso a paso está en el runbook. Si la variable queda
  puesta, cada arranque deja un WARN. Si es igual a `ORIGEN_SECRETO` o es
  débil, no arranca.
- **Cómo se ve en el log.** Con el filtro activo, el arranque registra
  «Encabezado de origen exigido (DEP-14)». Con `ninguno` en `prod`, registra
  el WARN «Encabezado de origen APAGADO».

**Alternativas descartadas.**

- **Aceptar solo las IP de Cloudflare.** El contenedor recibe la conexión
  del borde de Railway, no la de quien envía la petición. Habría que confiar
  en la IP que el borde informa en una cabecera (`X-Forwarded-For`, que el
  cliente también puede enviar) y mantener la lista de IP de Cloudflare, que
  cambia.
- **Authenticated Origin Pulls (mTLS).** Railway termina el TLS en su borde,
  así que el certificado de cliente de Cloudflare no llega al contenedor.
- **Cloudflare Tunnel.** Exige un proceso `cloudflared` junto al backend y
  cambia cómo llega el tráfico a Railway: demasiado cambio para el MVP.

El encabezado funciona con la plataforma actual, no agrega dependencias y es
lo que Cloudflare documenta para este caso. Su límite: si el secreto se
filtra, quien lo tenga puede volver a saltarse Cloudflare hasta que se rote.
Por eso el secreto solo vive en la regla de Cloudflare y en la variable de
Railway, nunca en el repositorio.

**Pruebas.**

- `EncabezadoDeOrigenFilterTest` (Surefire) cubre:
  - pasan el secreto vigente, el anterior durante una rotación, el nombre del
    encabezado en minúsculas y el health check;
  - recibe 403 cualquier otro valor: un carácter de más o de menos, otra
    capitalización, espacios alrededor, un carácter no ASCII o el anterior
    sin rotación;
  - recibe 403 el secreto en otro encabezado;
  - recibe 403 toda variante del health check y toda otra ruta;
  - el cuerpo es el mismo sin el encabezado que con un valor equivocado, y no
    menciona el encabezado;
  - el rechazo no registra el valor recibido ni los secretos;
  - el arranque falla con un secreto vacío, de 31 caracteres o con caracteres
    que no son ASCII visibles, con el anterior corto o igual al vigente, o con
    un nombre de encabezado inválido, y ningún mensaje repite el valor. Con 32
    caracteres, arranca.
- `EncabezadoDeOrigenConfigTest` cubre:
  - cuándo se exige: `ninguno` en cualquier capitalización lo apaga, y
    `ninguno ` (con espacio) o cualquier otro valor lo enciende;
  - que la variable sin definir falla nombrándola;
  - el lugar en la cadena, antes que Spring Security;
  - lo que queda en el log, sin los secretos.
- `EncabezadoDeOrigenIT` usa el perfil `prod` en plena rotación:
  - sin el encabezado, 403 en una ruta pública, con el cuerpo de cualquier
    403;
  - con un valor equivocado, el mismo 403;
  - con el secreto vigente o el anterior, pasa;
  - una ruta privada sigue exigiendo token;
  - `GET /actuator/health` responde sin el encabezado;
  - `HEAD` o `POST` al health, `/actuator/health/db`, `/actuator/env`, el
    preflight CORS, una foto de reporte, la búsqueda, la resolución de
    distrito y `/error` reciben 403, sin cabeceras CORS;
  - con el encabezado, el preflight y la foto llegan a la app.
- `ArranqueEncabezadoDeOrigenIT`: el perfil `prod` no arranca sin
  `ORIGEN_SECRETO`, ni vacía, ni con 31 caracteres. La base apunta a un
  puerto cerrado, y el error de abajo es el del secreto, sin el valor en la
  traza.
- `PerfilProdIT`: todas sus peticiones llevan el encabezado, como si pasaran
  por Cloudflare. Así prueba que con él el API funciona igual, y que un valor
  equivocado recibe 403 en una ruta pública. Los demás `Arranque*IT` que
  arrancan `prod` pasan `ORIGEN_SECRETO`.

**Activación en producción.** El orden importa: primero la regla de
Cloudflare, después la variable en Railway y al final el despliegue. Si se
invierte, el API responde 403 a todo hasta que la regla exista. El paso a
paso, la verificación con `curl --resolve` y la rotación están en el runbook
(`docs/despliegue.md`).

## Operación en producción

El registro público crea siempre cuentas `CIUDADANO`. Las otras dos se dan
desde fuera del API, a propósito: no existe ningún endpoint que cambie un
rol, así que no hay uno que proteger.

### Primer ADMIN (DEP-04)

`auth/infra/AdministradorInicialSeeder` (un `ApplicationRunner` que corre
después de los seeders de distritos y municipalidades) crea la cuenta en el
primer arranque de un entorno, y **solo si la base no tiene ningún ADMIN**.
Los ADMIN siguientes se gestionan aparte (decisión del usuario, 22/10).

1. En Railway › `backend` › Variables:
   - `ADMIN_INICIAL_EMAIL`: el correo de la persona, **sin cuenta** en la
     plataforma. Debe cumplir las mismas reglas que el registro.
   - `ADMIN_INICIAL_PASSWORD`, marcada como secreta: 12 caracteres o más y
     72 bytes como máximo (el límite de BCrypt; menos caracteres si lleva
     tildes o eñes). Mejor generada por un gestor de contraseñas.
   - `ADMIN_INICIAL_NOMBRE` (opcional): nombre completo. La primera palabra
     va a `nombre` y el resto a `apellido`; sin ella, «Administrador».
2. Railway redespliega. En el log: `Administrador inicial creado: <correo>`.
   Es lo único que se registra: la contraseña nunca llega al log.
3. **Borrar `ADMIN_INICIAL_PASSWORD`** (obligatorio) y dejar que Railway
   redespliegue. `ADMIN_INICIAL_EMAIL` y `ADMIN_INICIAL_NOMBRE` pueden quedar
   o borrarse: con un ADMIN ya creado, el seeder no hace nada. Si la
   contraseña quedara, cada arranque avisaría en el log que sigue definida,
   pero nunca la vuelve a usar.
4. La persona inicia sesión en la PWA con esa contraseña y acepta los
   términos (la pantalla aparece sola: el seeder no registra consentimiento,
   D-12). No hay una pantalla para cambiar la contraseña: cuando el correo
   saliente funcione (DEP-08), la cambia con «¿Olvidaste tu contraseña?»,
   para que solo ella la conozca.

| Situación al arrancar | Qué hace |
|---|---|
| `ADMIN_INICIAL_EMAIL` ausente o en blanco | Nada (log `INFO`). Es el caso de todo arranque normal. |
| Ya hay algún `ADMIN` (sea o no la cuenta de la variable) | Nada (log `INFO`, sin repetir el correo ni la contraseña). No valida las variables, no crea un segundo ADMIN aunque el correo sea nuevo y **nunca** cambia la contraseña ni el nombre de un ADMIN. |
| Sin ADMIN y sin cuenta con ese correo | La crea: `ADMIN`, activa, sin distrito, con el correo confirmado (NC-09: lo dio el operador, no un registro público) y la contraseña hasheada por el `PasswordEncoder` de la aplicación. |
| Sin ADMIN y el correo ya tiene cuenta (con otro rol, por fuerza) | **No arranca** («…nunca se promueve…»). |
| Sin ADMIN, y falta la contraseña, tiene menos de 12 caracteres o más de 72 bytes, o el correo no cumple las reglas del registro (`@Email`, 150 caracteres como máximo) | **No arranca**, sin crear nada y sin repetir el valor en el mensaje. |

Decisiones:

- **Crea, nunca promueve** (decisión del usuario, 22/10). Cualquiera puede
  registrarse con un correo ajeno (hasta NC-09 el registro no verificaba la
  propiedad del correo, y una cuenta sin confirmar sigue sin probarla). Si el
  seeder promoviera una cuenta existente, quien se registrara primero con ese
  correo quedaría como ADMIN. Promover una cuenta
  ya registrada fue la primera versión de la propuesta de despliegue y
  dependía del orden de los pasos: registrar la cuenta *antes* de definir la
  variable. Creándola, el orden deja de importar y el caso peligroso se
  convierte en un arranque fallido.
- **Solo en una base sin ADMIN** (ajuste del usuario, 22/10). El seeder es
  para arrancar un entorno, no una vía para crear administradores: con un
  ADMIN ya presente queda inerte. Así unas variables olvidadas en Railway no
  crean un segundo ADMIN si alguien cambia el correo, y tampoco pueden
  tumbar la API: si después alguien se registrara con el correo que quedó
  en la variable, la regla «otro rol → no arranca» haría fallar cada
  redespliegue. Por eso esa regla solo se aplica mientras no hay ningún
  ADMIN, que es cuando protege algo. Cualquier ADMIN cuenta, también uno
  inactivo (hoy no hay forma de desactivar cuentas).
- **Falla el arranque en vez de avisar.** Una configuración inválida se
  descubre al desplegar, con el mensaje en el log, y no días después, cuando
  nadie puede responder un ticket. Un `ApplicationRunner` corre cuando
  Tomcat ya escucha, así que `/actuator/health` puede responder un instante
  antes de que el proceso termine: el despliegue aparece caído y el motivo
  está en el log (`Application run failed`).
- **La contraseña viaja por una variable**, la única vía que no la deja
  escrita en el repositorio ni en el historial de la terminal. Por eso se
  borra después del primer arranque. No es una migración Flyway: el hash
  quedaría versionado y sería el mismo en todos los entornos.
- **El correo, con las reglas del registro** (`@Email` y 150 caracteres): un
  correo que el registro rechazaría (`ana@muni..pe`) tampoco sirve para el
  ADMIN. Las restricciones se repiten en un `record` privado del seeder y se
  validan con el `Validator` de Bean Validation, porque un adaptador de
  `infra` no puede depender de `RegistroRequest` (`dto`, regla `capas`).
- **Sin `@ConditionalOnProperty`.** Una variable definida pero vacía cuenta
  como presente para esa anotación; el seeder siempre existe y decide con el
  valor. Los tests fijan las tres propiedades en vacío
  (`application-test.yml`), así que una variable en el entorno de quien los
  corre no crea cuentas en la base de test.
- Capas: el seeder está en `auth/infra` y solo usa el repositorio y el
  dominio de su módulo, el `PasswordEncoder` y el `Validator`; no pasa por
  `AuthService` (la capa de aplicación solo la usa la presentación, §4).

**Verificación con el jar (2026-10-22)**, contra una base temporal vacía
(Flyway V1–V17 y los seeders desde cero), borrada al final:

1. Sin ADMIN y `ADMIN_INICIAL_PASSWORD=corta`: Tomcat abrió el puerto, 0,8 s
   después (tras sembrar los distritos) el seeder lanzó su error y el
   proceso terminó con código 1, sin crear la cuenta.
2. Sin ADMIN y una contraseña válida: `Administrador inicial creado:
   <correo>`; la cuenta quedó `ADMIN`, activa y con hash BCrypt (`$2a$`).
3. Con ese ADMIN, otro correo y `ADMIN_INICIAL_PASSWORD=corta`: arrancó
   normal, con el `INFO` de que las variables se ignoran y el aviso de
   borrar la contraseña; ninguna cuenta nueva.

En ninguno de los tres logs aparece la contraseña. (Medido antes de alinear
la validación del correo con la del registro; esa regla la cubren los tests.)

Tests. `AdministradorInicialSeederTest` (unitario, con el repositorio
simulado) prueba que los correos que el registro rechazaría hacen fallar el
arranque antes de buscar la cuenta. `AdministradorInicialSeederIT`, contra
la base, instancia el seeder con los valores de cada caso y llama a `run`
(la excepción es la que recibiría `SpringApplication`), sin levantar un
contexto por caso. La base de test es
compartida y otros IT dejan cuentas ADMIN, así que cada test corre en una
transacción que se revierte: dentro de ella, los casos «sin ADMIN» pasan los
ADMIN existentes a CIUDADANO, y al terminar todo vuelve a como estaba. Cubre
los cinco casos de la tabla (con un ADMIN presente: correo nuevo, contraseña
corta, correo mal formado y correo de un ciudadano, sin crear, fallar ni
promover nada), que la contraseña de un ADMIN cambiada después no se pisa, y
el primer inicio de sesión: entra como ADMIN, recibe 403
`TERMINOS_PENDIENTES` hasta aceptar los términos y luego usa una ruta de
ADMIN.

### Alta y baja de funcionarios (DEP-05)

1. La persona se registra en la PWA como cualquier ciudadano: así su
   contraseña queda con el hash de la aplicación y su aceptación de los
   términos, registrada (D-12).
2. **Antes de asignar, la persona confirma que el registro le funcionó a
   ella** (entra con su contraseña). Desde NC-09 una cuenta no inicia sesión
   sin confirmar su correo, así que entrar prueba que el correo es suyo, y
   desde NC-09b el script no asigna una cuenta sin confirmar. Si al
   registrarse vio «El correo ya está registrado», alguien pudo registrarse
   antes con su correo, y asignar le daría el rol a esa cuenta. En ese caso
   no se asigna hasta que ella recupere la cuenta: abre el enlace del correo
   de confirmación que recibió cuando el otro se registró (si venció, la
   página del enlace le deja pedir otro), y después cambia la contraseña con
   «¿Olvidaste tu contraseña?», que solo funciona con la cuenta confirmada.
   Si ya no tiene ese correo, pide el enlace de nuevo con «Reenviar el
   enlace», que «¿Olvidaste tu contraseña?» ofrece tras pedir el token
   (NC-09c; ver «Cuentas sin confirmar (NC-09b)»).
   El script muestra la fecha de registro de la
   cuenta (`created_at`, hora de Lima) y si confirmó su correo, para
   compararlo con lo que la persona recuerda.
3. Un operador con acceso a la base corre `backend/scripts/asignar-funcionario.sql`
   con variables de `psql`, desde la raíz del repositorio:

   ```bash
   # Asignar (la URL de conexión pública está en Railway › postgis › Connect)
   psql "<URL de la base>" -v email=persona@ejemplo.com -v distrito='San Isidro' \
     -f backend/scripts/asignar-funcionario.sql
   # Devolver a CIUDADANO
   psql "<URL de la base>" -v email=persona@ejemplo.com -v accion=revocar \
     -f backend/scripts/asignar-funcionario.sql
   # Desde una sesión abierta con `railway connect postgis`
   #   \set email 'persona@ejemplo.com'
   #   \set distrito 'Miraflores'
   #   \i backend/scripts/asignar-funcionario.sql
   # En local (Docker), por la entrada estándar
   docker exec -i viasegura-db psql -U viasegura -d viasegura \
     -v email=persona@ejemplo.com -v distrito=Miraflores < backend/scripts/asignar-funcionario.sql
   ```

   Si todo va bien, muestra la fila resultante (correo, rol, distrito, fecha
   de registro).
4. La persona recarga la PWA: no hace falta que vuelva a iniciar sesión
   (ver abajo).

| Caso | `asignar` (por defecto) | `accion=revocar` |
|---|---|---|
| Cuenta `CIUDADANO` con el correo confirmado | Pasa a `FUNCIONARIO_MUNICIPAL` con ese distrito. Si tenía distrito de residencia, avisa que se reemplaza (es el mismo campo). | Nada (aviso). |
| Cuenta `CIUDADANO` sin confirmar el correo (NC-09b) | **Falla**: «La cuenta … no confirmo su correo: no se le asigna el rol.», con la pista de abrir el enlace o pedir otro con «Reenviar». | Nada (aviso). |
| `FUNCIONARIO_MUNICIPAL` del mismo distrito | Nada (aviso): se puede repetir. | Vuelve a `CIUDADANO`, sin distrito. |
| `FUNCIONARIO_MUNICIPAL` de otro distrito | **Falla**: primero se revoca. | Vuelve a `CIUDADANO`, sin distrito. |
| `ADMIN` | **Falla.** | **Falla.** |
| Correo inexistente | **Falla** (sugiere los que solo difieren en mayúsculas). | **Falla.** |
| Distrito que no coincide con exactamente uno | **Falla** (sugiere los parecidos). | No se usa. |
| Falta `email` o `distrito`, o `accion` desconocida | **Falla.** | **Falla.** |

**Cuándo rige el cambio.** El JWT lleva el rol (claim `rol`), pero nada lo
lee para autorizar: `JwtAuthenticationFilter` solo toma del token el correo
(el *subject*) y `UsuarioDetailsService` carga el rol de la base en cada
petición. La PWA, a su vez, obtiene el rol de `GET /api/auth/me`
(`useSesion`), no del token. Por eso el cambio rige desde la siguiente
petición, sin cerrar sesión, y revocar corta el acceso de funcionario de
inmediato aunque el token siga vigente.

Decisiones:

- **Un script y no un endpoint.** No existe ningún endpoint que cambie un
  rol, así que no hay uno que proteger ni que un ADMIN comprometido pueda
  usar; asignar funcionarios exige acceso a la base. El registro previo da
  el hash y el consentimiento sin que el operador vea la contraseña.
- **Solo de `CIUDADANO` a funcionario.** Cambiar de distrito a un
  funcionario mueve su bandeja: se pide revocar y volver a asignar, para
  que no ocurra por un error de tipeo. Un ADMIN nunca se toca.
- **Solo una cuenta con el correo confirmado** (NC-09b, decisión del
  usuario del 28/10). Sin confirmar, nada prueba que el correo sea de la
  persona: es el caso de quien registró antes un correo ajeno. Antes de
  NC-09b dependía de que el operador siguiera el paso 2; ahora lo comprueba
  el script, en el mismo bloque `DO`, así que falla sin asignar nada. El
  aviso inicial dice si la cuenta confirmó su correo. Revocar no lo mira:
  quitar el rol siempre debe poder hacerse.
- **Atómico y sin restos en la sesión.** Todas las comprobaciones y el
  `UPDATE` van en un bloque `DO` dentro de `BEGIN … COMMIT`, y los datos
  pasan de `psql` a la base con `SET LOCAL`, que desaparece al terminar la
  transacción. Si el `DO` falla, el script hace `ROLLBACK` antes de cortarse
  (con `ON_ERROR_STOP` encendido desde el principio, una sesión abierta
  quedaría con la transacción abortada). Con `-f` o por la entrada estándar,
  `psql` termina con código 3; con `\i` en una sesión abierta, la sesión
  sigue sin transacción ni valores del script. Las variables de `psql` se
  borran al leerlas, así que tampoco quedan para la persona siguiente;
  solo si el script se corta antes de leerlas (por ejemplo, falta `email`)
  quedan las que se habían definido.
- **Nombre del distrito sin mayúsculas ni tildes** (`rimac` encuentra
  «Rímac»). El archivo es ASCII (las vocales con tilde van como escapes
  Unicode), así que no depende de la codificación del cliente. En Windows
  conviene escribir el nombre sin tildes ni eñes: desde Git Bash, `-v
  distrito=Breña` llega mal codificado a `psql` y el script falla sin
  cambiar nada; `Brena` funciona.
- **Jurisdicción en `usuario.distrito_id`**, como hoy. Si D-10 la pasa a
  `municipalidad_id`, el script cambia con esa tarea.

**Verificación (2026-10-21)** contra `viasegura_test`, con cuentas propias
que se borraron al final. Es una desviación del criterio de DEP-05, que
pedía probarlo en la base local con los usuarios de `seed-datos-prueba.sql`:
esa base estaba en uso por el coordinador. Con el `psql` 18 de Windows
(`-f`) y con el del contenedor (entrada estándar): asignación con aviso de la residencia
reemplazada; repetición sin cambios (mismo `updated_at`); `rimac`, `Brena` y
`jesus maria` encuentran su distrito, y `Breña` desde un cliente UTF-8;
revocación y su repetición; `\set` + `\i` deja las variables sin definir; y
código 3, sin cambios en la base, para el correo inexistente (y con otras
mayúsculas), la cuenta ADMIN (al asignar y al revocar), el funcionario de
otro distrito, el distrito inexistente (`Miraflore`), la falta de `email` o
`distrito` y una `accion` desconocida.

**Verificación de la transacción (2026-10-22)**, en una base temporal con
un esquema mínimo (`usuario` y `distrito`), borrada al final, porque
`viasegura_test` estaba ocupada por otra suite de IT: los mismos casos de
éxito y de fallo (código 3, `ROLLBACK` antes del error final y la base sin
cambios), el aviso con la fecha de registro, el archivo con CRLF y, en una
misma sesión, un `\i` que falla (la cuenta ADMIN) seguido de otro que
funciona: tras el fallo no queda transacción abierta, ni el `SET LOCAL`, ni
las variables, y la persona siguiente se asigna sin arrastrar nada.

**Verificación de NC-09b (2026-10-28)** contra `viasegura_test`, con el
`psql` del contenedor (entrada estándar) y dos cuentas propias que se
borraron al final: la cuenta sin confirmar da el aviso «correo SIN
CONFIRMAR», el error y la pista de arriba y código 3, y queda `CIUDADANO`
sin distrito; la confirmada (aviso «correo confirmado») se asigna a
Miraflores con `miraflores` y se revoca. Lo prueba además
`AsignarFuncionarioScriptIT` en cada `mvn verify`: corre el bloque `DO` leído
del archivo (no una copia), porque `psql` no está garantizado en la CI ni en
el PATH de Windows.

### Respaldo diario de la base (DEP-09, v0.7.2)

`scripts/respaldo-bd/` es el servicio cron `respaldo-bd` de Railway (runbook
§5.3):
- **Imagen:** `postgres:16.15-alpine3.24` más `curl` 8.x, con la versión
  fijada.
- **Script:** `respaldar.sh` hace un `pg_dump --format=custom --no-owner
  --no-privileges` por la red privada y lo valida antes de subirlo:
  - `pg_restore --file=/dev/null` lee y descomprime cada bloque;
  - el índice del volcado tiene que incluir los datos de
    `flyway_schema_history`. Así se descarta una base vacía o equivocada.

  Después lo sube a `ciudadviva-respaldos` en R2 con `curl --aws-sigv4`. El
  sha256 del volcado va dentro de la firma, y R2 rechaza un cuerpo que no
  coincida.
- **Timeouts:** 15 s para conectar a la base, 60 s de espera por un lock,
  20 s para conectar a R2 y 15 min para la subida, con 3 reintentos. Un
  cuelgue haría que Railway saltara las corridas siguientes sin avisar.
- **Claves de R2:** van por la configuración de curl en stdin, así que no
  aparecen en los argumentos del proceso. La contraseña de la base sí va en
  los argumentos de `pg_dump`, dentro de la URL, pero en un contenedor de un
  solo proceso no es un riesgo.
- **Errores:** ante cualquiera sale con código distinto de 0, y Railway
  marca la corrida como fallida.

**Por qué un script propio y no una plantilla de Railway:** la plantilla que
nombraba el runbook («Postgres S3 Backups», `railwayapp-templates/…`) quedó
archivada. La plantilla oficial que la reemplaza despliega código mantenido
por un tercero, fuera de `railwayapp-templates`, con acceso a la base y al
bucket. Además crea un bucket de Railway que no se usa. Decisión del usuario
(25/10): opción (b), script propio versionado y revisado.

- **Cliente de la misma versión mayor que el servidor (16):** el volcado se
  restaura con el `pg_restore` del PostGIS local (runbook §8).
- **Formato custom:** viene comprimido y se valida antes de subirlo.

**Verificación (2026-10-25)** con Docker:
- **Contra el PostGIS de desarrollo y S3Mock 5.2.3:**
  - sin variables, sale con código 1 y nombra la que falta;
  - con una base vacía, sale con código 1 y explica que el volcado no tiene
    los datos de `flyway_schema_history`;
  - con un host que no responde, corta a los 15 s con el error de libpq,
    que muestra el host y el puerto, no la contraseña;
  - con un bucket inexistente, muestra el XML de error del servicio y sale
    con código 22;
  - con todo correcto, sube `ciudadviva-<fecha UTC>.dump` (154 kB), y el
    sha256 del objeto descargado coincide con el que imprime el script.
- **Restauración según el runbook §8**, en una base nueva:
  - `pg_restore` termina sin errores;
  - la copia tiene los mismos 190 reportes, 40 usuarios, 43 distritos y
    309 filas de historial que el original;
  - también coinciden la versión de Flyway, PostGIS 3.4.3 y las 109 filas
    de `mv_indice_desempeno_distrital`.
- **Falta verificarlo contra R2 real**, porque S3Mock no valida la firma
  SigV4. Se prueba en la primera corrida en Railway, con
  `BACKUP_FILE_PREFIX=prueba` (runbook §5.3).

## Endpoints implementados (vertical slice inicial)

| Método | Ruta                | Auth | Historia | Descripción |
|--------|---------------------|------|----------|-------------|
| POST   | `/api/auth/registro`| No   | US-01    | Registrar cuenta ciudadana (exige aceptar los términos vigentes, D-12). Desde NC-09 la cuenta nace sin confirmar y la respuesta no trae token |
| POST   | `/api/auth/confirmar-correo` | No | NC-09 | Confirmar el correo con el token del enlace (204; no inicia sesión) |
| POST   | `/api/auth/reenviar-confirmacion` | No | NC-09 | Pedir otro enlace (202 siempre) |
| POST   | `/api/auth/login`   | No   | US-02    | Iniciar sesión (devuelve JWT). Sin el correo confirmado, 409 `CORREO_NO_CONFIRMADO` |
| GET    | `/api/auth/me`      | Sí   | US-02    | Datos del usuario autenticado (con `debeAceptarTerminos`) |
| GET/POST | `/api/auth/me/consentimientos` | Sí | NC-07b | Consentimientos propios: listar y aceptar (ver [Consentimiento](#consentimiento-d-12-nc-07b)) |
| DELETE | `/api/auth/me/consentimientos/{finalidad}` | Sí | NC-07b | Revocar un consentimiento propio |

### Ejemplo rápido

```bash
# Registro (201 con {"email", "vigenciaEnlaceHoras"}; sin token desde NC-09)
curl -X POST http://localhost:8080/api/auth/registro \
  -H "Content-Type: application/json" \
  -d '{"email":"vecino@lima.pe","password":"secreta123","nombre":"Ana","apellido":"Ruiz","aceptaTerminos":true,"versionTerminos":"2026-10-v1"}'

# Confirmar el correo: el enlace llega a Mailhog (http://localhost:8025),
# http://localhost:3000/confirmar-cuenta?token=<TOKEN_DEL_ENLACE>
curl -X POST http://localhost:8080/api/auth/confirmar-correo \
  -H "Content-Type: application/json" \
  -d '{"token":"<TOKEN_DEL_ENLACE>"}'

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
│   ├── security/      # SecurityConfig, JwtService, JwtAuthenticationFilter, EncabezadoDeOrigenFilter (DEP-14)
│   ├── exception/     # GlobalExceptionHandler, ApiError, excepciones de dominio
│   ├── domain/        # BaseAuditableEntity (createdAt/updatedAt)
│   ├── port/          # FotoStorageService (fotos, D-11), SaneadorDeImagen (DEP-12) y CorreoSaliente (DEP-08)
│   └── infra/         # LocalFotoStorageService (disco), S3FotoStorageService (R2), ImageIoSaneadorDeImagen,
│                      #   SmtpCorreoAdapter y ResendCorreoAdapter
├── auth/              # US-01..US-04  (Usuario, login/registro, roles)
├── distritos/         # Distrito (límites GEOGRAPHY, base de asignación)
├── municipalidades/   # Municipalidad (1:1 con distrito, D-09) y PeriodoGestion (NC-01)
├── clasificacion/     # Sugerencia de categoría por la foto (NC-04): port/ClasificadorDano,
│                      #   infra/InferenciaHttpAdapter (NC-04b) y FalsoClasificadorAdapter,
│                      #   domain/PoliticaDeSugerencia
├── moderacion/        # Moderacion de contenido (NC-10b, D-15): port/ModeradorDeImagen,
│                      #   infra/InferenciaModeracionHttpAdapter y SinModeracionAdapter,
│                      #   domain/PoliticaDeModeracion y FiltroDeGroserias (resources/moderacion/)
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
  (`notificaciones/port/` + `notificaciones/infra/`), y para el transporte del
  correo (`common/port/CorreoSaliente`: SMTP o Resend, DEP-08).
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

**Dos lecturas de la clave desde BE-11.** La foto se sanea y se sube antes
de abrir la transacción (ver [La foto del reporte, fuera de la
transacción](#la-foto-del-reporte-fuera-de-la-transacción-be-11)), así que la
clave se lee dos veces: antes de la foto, para que un reenvío con respuesta
guardada vuelva **sin sanear ni subir nada** (y, con NC-10b, sin moderar), y
otra vez al empezar la transacción, porque mientras la foto subía otro envío
con la misma clave pudo confirmarse. En ese caso se devuelve su respuesta y
la foto de este envío, que ningún reporte usa, se borra.

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

Varias excepciones de Spring MVC caían en el manejador genérico de
`GlobalExceptionHandler` y respondían **500**: "el servidor falló" cuando la
petición era inválida, y en producción un 500 dispara alertas por un caso
normal. Ahora responden con el mismo `ApiError` que el resto:

| Excepción | Código | Ejemplo | Mensaje |
|---|---|---|---|
| `MaxUploadSizeExceededException` | **413** | Foto de más de 10 MB en `POST /api/reportes` o `PATCH /api/auth/me` | `La foto supera el tamaño máximo de 10 MB` (el límite sale de `spring.servlet.multipart.max-file-size`) |
| `HttpRequestMethodNotSupportedException` | **405** | `GET /api/auth/login` | `El método GET no está permitido en esta ruta`, con la cabecera `Allow` que exige el RFC 9110 |
| `HttpMediaTypeNotSupportedException` | **415** | JSON a `POST /api/reportes` o a `PATCH /api/auth/me`, que son multipart | `Tipo de contenido no admitido en esta ruta: se espera multipart/form-data`, con `Accept` (y `Accept-Patch` en un PATCH) |
| `MissingServletRequestParameterException` | **400** | `GET /api/distritos/por-coordenadas` sin `lon` | `Falta el parámetro obligatorio 'lon'` |
| `MissingServletRequestPartException` | **400** | Un formulario multipart sin una parte obligatoria (hoy ningún endpoint la tiene: las fotos son opcionales; el manejador es preventivo) | `Falta la parte obligatoria '<parte>' del formulario` |

**Los 500 que quedan se registran.** El manejador genérico sigue
respondiendo un 500 con un mensaje fijo, pero ahora registra la excepción en
`ERROR` con el método, la ruta y la traza
(`Error no controlado en POST /api/…`). En producción la respuesta no lleva
detalles (`include-stacktrace: never`), así que sin ese registro un 500 no
dejaba rastro. Nunca se registra el cuerpo ni la query de la petición, que
pueden traer contraseñas o datos personales.

**413 también para subidas grandes.** Los límites son 10 MB por archivo y
12 MB por petición. Si la petición entera supera los 12 MB, Tomcat la
rechaza por su `Content-Length` sin leer el cuerpo, y luego solo descarta
hasta `server.tomcat.max-swallow-size` de lo que queda sin leer: con el valor
por defecto (2 MB) cortaba la conexión y el cliente veía un error de red en
lugar del 413. Para la PWA eso es peor que un error: un `NetworkError` manda
el reporte a la cola offline (US-06), que lo reintentaría una y otra vez. Con
`max-swallow-size: 32MB` (en `application.yml`, para todos los perfiles)
Tomcat lee y descarta esos bytes sin guardarlos, y el cliente recibe el 413.
Por encima de 32 MB vuelve a cortar la conexión: es el tope de lo que el
servidor acepta leer para nada.

**Validación en el cliente.** La PWA valida los 10 MB de la foto del reporte
antes de subirla (`CampoFoto.tsx`), pero **no** la foto de perfil
(`PATCH /api/auth/me`): ahí el 413 es lo único que la frena. Queda una tarea
de seguimiento para el frontend: rechazar en el cliente las fotos de más de
10 MB, también la de perfil, antes de enviarlas o encolarlas.

Lo prueba `ErroresHttpIT`, con servidor real (`RANDOM_PORT`) para el 413
porque el límite lo aplica Tomcat al leer el multipart y MockMvc no lo
ejecuta: fotos de 11 MB y de 30 MB en `POST /api/reportes` y de 30 MB en
`PATCH /api/auth/me` reciben el 413 (con el `max-swallow-size` por defecto,
la de 30 MB fallaba con un corte de conexión). La parte obligatoria y el 500
se prueban con un controlador que solo existe en ese IT; el 500 verifica,
con un *appender* de Logback, que el evento se registra en `ERROR` con
método y ruta y sin el cuerpo de la petición.

## Textos para el usuario (QA-1)

El recorrido QA-1 (`docs/qa/2026-10-21-mvp-v0.6.0.md`, hallazgo M-1) encontró
textos sin tildes ni eñes en todo lo que el backend le muestra a una persona.
La PWA los muestra tal como llegan, así que se corrigen en el origen.

### Categorías estándar con tildes (V18)

V3 sembró «Vereda danada», «Semaforo averiado» y «Senalizacion faltante» (y
dos descripciones con el mismo problema). V3 ya está aplicada en todas las
bases y no se edita, así que la corrección es una migración nueva,
`V18__categorias_estandar_con_tildes.sql` (propuesta aceptada el 22/10,
opción A). Cada `UPDATE` filtra por `es_estandar` y por el texto viejo. Los
reportes guardan `categoria_id`, así que ninguna referencia cambia.

**Se detiene ante un choque.** `CategoriaDanoService` impide que un distrito
cree una categoría con el nombre de una estándar sin distinguir mayúsculas,
pero sí tildes: mientras la estándar se llamaba «Vereda danada», un distrito
pudo crear «Vereda dañada». Después del `UPDATE` su selector mostraría dos
opciones iguales. Por eso V18 empieza con un bloque `DO` que busca categorías
de distrito con alguno de los nombres corregidos (comparando con `lower()`,
como la consulta del servicio) y, si encuentra alguna, lanza `RAISE
EXCEPTION` con su nombre, id y distrito. El arranque falla y Flyway no
registra V18: se renombra esa categoría a mano y se vuelve a arrancar. En
producción no puede pasar, porque arranca sin categorías de distrito; en las
bases locales y en `viasegura_test` se comprobó antes de migrar.

**Límite de la comprobación: `lower()` depende del `LC_CTYPE` de la base.**
Con un `LC_CTYPE` UTF-8 (`en_US.utf8` en el contenedor `postgis/postgis`,
comprobado en `viasegura_test`) `lower('SEMÁFORO')` es `semáforo` y la
comprobación detecta también «SEMÁFORO AVERIADO». Con el locale `C`, `lower()`
solo baja las letras ASCII: «SEMÁFORO AVERIADO» pasaría sin detectarse,
aunque «Semáforo averiado» o «semáforo averiado» sí se detectan. Es el mismo
criterio que ya aplica el servicio (la consulta derivada usa `upper()` en
SQL), así que V18 no es más permisiva que la validación de cada día. No se
documenta en el SQL de V18 porque cambiar un comentario cambia su checksum y
la migración ya está aplicada.

«Hueco en calzada» no se toca aquí: su desactivación (decisión de ML del
21/10) va con la migración de NC-04. La categoría de distrito «Malecon
erosionado» que cita QA-1 es un dato de una base local y se corrige desde la
interfaz.

`CategoriasEstandarConTildesIT` lee las seis estándar (en la base y en
`GET /api/categorias`) y vuelve a ejecutar el script de V18 dentro de una
transacción que siempre se revierte: sobre los textos de V3, los corrige, y
con una categoría de distrito «vereda DAÑADA», se detiene con el mensaje.

### Mensajes del API y correos

- **Mensajes con tildes y bien escritos** en todo lo que llega al `message`
  del `ApiError`: `GlobalExceptionHandler` («Credenciales inválidas», «Error
  de validación», «El método GET no está permitido…»), los manejadores de
  seguridad («Autenticación requerida», el 403 de términos pendientes), los
  servicios («El correo ya está registrado», «Ya reportaste este daño», «La
  categoría seleccionada no está activa»…) y el saneado de fotos. Los
  mensajes que nombran un estado usan su **etiqueta** («Transición de estado
  inválida: de Resuelto a Recibido», «No se puede asignar un responsable a
  un reporte en estado Pendiente»). Los de `AccessDeniedException` también
  se corrigieron, aunque el cliente siempre recibe el «Acceso denegado» fijo.
- **La PWA no compara textos.** Antes de cambiar un mensaje se buscó en
  `frontend/src` si algún código lo comparaba: solo
  `features/auth/model/terminos.ts` reconoce el 409 de términos desactualizados
  por su mensaje, con `/t[eé]rminos/i`, que acepta el texto nuevo («La
  versión de los términos aceptada no es la vigente…»). El resto decide por
  el `status` (y el 403 de términos por `codigo`).
- **Línea de tiempo del ciudadano:** la asignación redactada dice «Se asignó
  un responsable para la atención del reporte.»
  (`SeguimientoReporteService.ASIGNACION_REDACTADA`).
- **Etiquetas en vez de enums.** `EstadoReporte.etiqueta()` devuelve el nombre
  que muestra la PWA («En proceso», `frontend/src/lib/types/estados.ts`). Es
  una regla pura del dominio, así que la usan los correos, los mensajes de
  error y la exportación sin depender de la presentación. El JSON del API
  sigue enviando el valor del enum (`"estado": "EN_PROCESO"`): la PWA lo
  traduce y los filtros lo necesitan.
- **Correos con trato de tú**, como la PWA. Aviso de estado: asunto
  «Ciudad Viva: tu reporte está en proceso» y cuerpo «Hola, Ana: tu reporte
  en el distrito de Miraflores pasó de Recibido a En proceso. Comentario de
  la municipalidad: …» (antes «paso de RECIBIDO a EN_PROCESO», de usted). El
  push usa el mismo asunto como título y «Tu reporte #42 está en proceso.»
  como cuerpo. Recuperación: «Ciudad Viva: recuperación de contraseña», con el
  cuerpo corregido. El correo de soporte ya trataba de tú; su cuerpo es la
  respuesta que escribe el ADMIN.
- Los asuntos con tildes viajan bien: el adaptador SMTP usa la codificación
  UTF-8 de `spring.mail` (RFC 2047 en el asunto) y Resend recibe JSON en
  UTF-8. `NotificacionIT` y `PasswordResetIT` leen el asunto y el cuerpo
  decodificados que llegan a GreenMail.

### Errores de validación sin nombres técnicos (M-2)

Un 400 de `@Valid` decía «Error de validacion / password: el tamaño debe
estar entre 8 y 72»: el nombre del campo en inglés delante del mensaje por
defecto de Bean Validation, que no tiene sujeto. Ahora cada restricción de
cada DTO lleva su propio mensaje, una oración que nombra el dato en palabras
(«La contraseña debe tener entre 8 y 72 caracteres», «Ingresa tu nombre»,
«El correo no tiene un formato válido»), con `{min}` y `{max}` interpolados
desde la anotación para que el número no se duplique. La forma del `ApiError`
no cambia: `message` sigue siendo «Error de validación» y `details`, una
lista de textos, ahora sin el prefijo `campo: `.

- **Por qué mensajes en los DTO y no un mapa de etiquetas en
  `GlobalExceptionHandler`.** Con un mapa, el texto seguiría siendo el de
  Bean Validation («Contraseña: el tamaño debe estar entre 8 y 72») y el
  mapa sería una segunda lista de campos que mantener. El mensaje junto a la
  restricción se lee donde se declara la regla.
- **Guarda de completitud.** `MensajesDeValidacionTest` (Surefire) recorre las
  clases de todos los paquetes `dto` y falla si alguna restricción de
  `jakarta.validation.constraints` o de `org.hibernate.validator.constraints`
  conserva su mensaje por defecto (plantillas `{jakarta.validation.…}` y
  `{org.hibernate.validator.…}`; y si no encuentra ninguna, para no pasar en
  vacío). Si aun así llegara una,
  `GlobalExceptionHandler` le antepone el campo, como antes.
- **Las rutas multipart no pasan por `@Valid`.** La creación del reporte y la
  edición del perfil validan en el servicio; ahí faltaban dos topes que
  terminaban en **500** al chocar con la columna: la descripción del reporte
  (más de 1000 caracteres) y el nombre o el apellido del perfil (más de 100).
  Ahora son 400 con su mensaje (`Reporte.validarDescripcion`,
  `AuthService.exigirLargoMaximo`), contando code points como el `varchar`.
- Los mensajes de parámetros de query mal tipados siguen nombrando el
  parámetro (`Valor inválido para el parámetro 'fechaDesde'…`): los arma un
  cliente del API, no una persona en un formulario. El rango de fechas
  invertido ahora dice «La fecha de inicio no puede ser posterior a la fecha
  de fin».

## Ajustes del API tras QA-1

### Responsable sin asignar: 204 (M-4)

`GET /api/reportes/{id}/responsable` respondía **404** cuando el reporte no
tenía responsable, y cada detalle de la bandeja dejaba un error rojo en la
consola del navegador. Un reporte sin responsable es un estado normal (todo
reporte recién recibido lo está), no un recurso inexistente. Ahora:

| Caso | Respuesta |
|---|---|
| Hay responsable vigente | **200** con `AsignacionResponsableResponse` |
| El reporte existe y no tiene responsable | **204** sin cuerpo |
| El reporte no existe | **404** |
| El reporte es de otro distrito | **403** (regla de jurisdicción de siempre) |

**Por qué 204 y no 200 con `null`.** 204 es el código de HTTP para «la
operación salió bien y no hay representación que devolver», y el cliente de
la PWA ya lo maneja (`apiFetch` devuelve `undefined` ante un 204, como en
`restablecer-password`). Un 200 con el literal `null` obligaría a escribirlo a
mano (Spring deja el cuerpo vacío cuando el método devuelve `null`) y en
OpenAPI quedaría como el mismo esquema de la asignación, sin decir que puede
faltar. El servicio devuelve `Optional` y el controlador lo traduce: el 404
sigue saliendo solo de `ResourceNotFoundException` (reporte inexistente).
Contrato para el frontend en
`project-context/handoffs/2026-10-22-responsable-sin-asignar-204.md`.

### Exportación CSV/XLSX completa y en hora de Lima (M-5)

QA-1 abrió el archivo exportado por `func.miraflores` y le faltaba lo que un
funcionario necesita para despachar o rendir cuentas. Las columnas son ahora:

| Columna | Valor |
|---|---|
| ID | id del reporte (numérico en el XLSX) |
| Título | el que escribió el ciudadano (NC-02) |
| Categoría | nombre de la categoría |
| Estado | etiqueta («En proceso», «Cancelado»), no el enum |
| Severidad | «Baja», «Media» o «Alta» |
| Adhesiones | vecinos que lo reportaron, creador incluido (numérico en el XLSX) |
| Ubicación (lat, lon) | con punto decimal siempre (`Locale.ROOT`), sea cual sea el locale del servidor |
| Fecha de reporte (hora de Lima) | `yyyy-MM-dd HH:mm` en `America/Lima` |
| Fecha de resolución (hora de Lima) | ídem, vacía si no está resuelto |
| Responsable asignado | el vigente, o vacío |

- **Hora de Lima, dicha en el encabezado.** Antes las fechas salían en UTC sin
  aviso: el #186, creado a las 20:28 del 21/10 en Lima, figuraba a la 01:28
  del 22. Un funcionario lee horas locales; el encabezado deja claro cuáles.
- **Los cancelados siguen saliendo** (la bandeja también los muestra), pero
  ahora se distinguen por su estado.
- **CSV con BOM UTF-8** (`EF BB BF`) y `Content-Type: text/csv;charset=UTF-8`.
  Excel en Windows abre un CSV sin BOM con la página de códigos del sistema y
  mostraba «SemaforizaciÃ³n». Los lectores que siguen el estándar ignoran el
  BOM.
- **Encabezados entre comillas.** Se escribían sin comillas, así que
  «Ubicación (lat, lon)» partía el encabezado en dos columnas y quedaba una
  columna más que en los datos. Ahora todo valor va entre comillas (RFC 4180).
- **Números como números en el XLSX.** El puerto `ExportadorReportes` recibe
  las celdas como `String`, `TextoLibre` o `Number`; Apache POI escribe los
  `Number` como celdas numéricas, para que el ID y las adhesiones se ordenen
  y sumen como números y no como texto («10» antes que «2»).
- **Sin inyección de fórmulas en el CSV** (SEC-04): el título, la categoría y
  el responsable, que escribe una persona, llevan un apóstrofo delante si
  empiezan por `=`, `+`, `-`, `@`, tabulador o retorno de carro. Ver
  [SEC-04](#sec-04--el-csv-exportado-podía-ejecutar-fórmulas-en-excel).

`ExportarReportesIT` lee el CSV con un analizador RFC 4180 (un título con
comillas y coma), comprueba el BOM, las diez columnas en cada fila, una fila
completa con fechas fijadas por SQL (20:28 en Lima) y, en el XLSX, el tipo
numérico de las celdas.

### Reportes que el ciudadano apoya: `GET /api/reportes/mis-adhesiones` (M-6)

Al adherirse (US-09), la PWA ofrece «Ver mis reportes», pero
`/mis-reportes` solo devuelve lo que el ciudadano **creó** (decisión de US-07)
y el reporte apoyado no aparecía en ningún lado. Se agregó un endpoint:

| Método | Ruta | Rol | Respuesta |
|---|---|---|---|
| GET | `/api/reportes/mis-adhesiones` | CIUDADANO | `ReporteResumenResponse[]`: reportes de otros vecinos a los que se adhirió, del apoyo más reciente al más antiguo, en cualquier estado |

**Por qué un endpoint aparte y no un campo `relacion: CREADOR | ADHERIDO`
en `mis-reportes`.** Se evaluaron las dos opciones y se eligió la más simple
y compatible:

- **La regla de los DTO.** «Lo apoyo, no lo creé» depende de quien consulta.
  Ponerlo en `ReporteResumenResponse` lo dejaría en un DTO que comparten el
  mapa público y el anónimo; la alternativa sería un DTO nuevo solo para
  `mis-reportes`. Con un endpoint propio la relación la da la ruta y el DTO
  sigue siendo el público, sin campos nuevos (y sin señales internas:
  `SenalInternaFueraDeDtosPublicosIT` cubre también esta ruta).
- **Compatibilidad.** `mis-reportes` no cambia. La PWA arma el detalle
  `/mis-reportes/{id}` buscando el reporte en esa lista y ofrece editar o
  retirar según el estado; mezclar ahí reportes ajenos mostraría acciones que
  el backend rechaza con 403 (solo el creador edita o retira). El endpoint
  nuevo es aditivo: la PWA lo usa cuando quiera.

Incluye todos los estados, también **CANCELADO**: cancelar retira el reporte
para todos sus afectados (US-08), y el vecino que lo apoyaba tiene que poder
enterarse. El detalle público de un cancelado da 404, pero el adherido sí
puede leer su línea de tiempo (`/historial`, US-22). La consulta
(`AdhesionReporteRepository.reportesAdheridosPor`) excluye los reportes del
propio usuario, que también tiene fila en `adhesion_reporte` como creador.

**Fuera de alcance:** los avisos de cambio de estado (US-16, US-21) siguen
yendo solo al creador (`ReporteEstadoCambiadoEvent.creadorId`); avisar
también a los adheridos es una decisión aparte. Contrato para el frontend en
`project-context/handoffs/2026-10-22-mis-adhesiones.md`.

## Catálogos de referencia (descubribilidad)

Dos endpoints **públicos** de solo lectura que existen para que un cliente
pueda *descubrir* los identificadores que el resto de la API exige. No los
pide ninguna historia de forma literal, pero sin ellos el frontend no puede
construir la UI de US-05 (crear reporte), US-10 (mapa) ni US-12 (búsqueda):
todas necesitan un `categoriaId` o un `distritoId` válido.

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| GET | `/api/categorias` | No | Categorías seleccionables. Sin `?distritoId=`: solo las estándar activas (5 desde V19, que desactivó «Hueco en calzada», NC-04). Con él: estándar + personalizadas activas de ese distrito (US-29). |
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

**Moderación (NC-11a, 28/10).** Desde V21 hay una segunda salida del índice
fuera de `CANCELADO`: un reporte **oculto por el ADMIN** no cuenta (decisión
del usuario). SEC-01 se mantiene porque esa salida está en manos de un actor
que **no se mide**: solo el ADMIN (la plataforma) oculta, con un motivo, una
entrada en la línea de tiempo y de forma reversible. El
`FUNCIONARIO_MUNICIPAL` no tiene ninguna ruta de moderación ni de denuncia
(403, `OcultamientoReporteIT`), y su única vía para descartar sigue siendo
`RECHAZADO`, que cuenta. Las denuncias de los ciudadanos no tienen efecto
automático: juntar cuentas no saca nada del índice. Si el daño es real y solo
la foto incumple, el ADMIN oculta la foto, que no mueve el índice.

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
| `ReporteResumenResponse` | **no** | `GET /api/reportes`, `GET /api/reportes/{id}`, `GET /mis-reportes`, `GET /mis-reportes/pendientes-calificacion`, `GET /mis-adhesiones` (QA-1 M-6), `PATCH /api/reportes/{id}`, `DELETE /api/reportes/{id}` |
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
públicos y del ciudadano. Desde QA-1 M-6 cubre además `GET /mis-adhesiones`,
que devuelve el mismo DTO.

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

### SEC-04 — El CSV exportado podía ejecutar fórmulas en Excel

**Detectado:** 2026-10-22, en la revisión de la tarea QA-1 (PR #100), antes
de llegar a `develop`.
**Estado:** corregido y cubierto por tests.

**El problema (CWE-1236, *CSV injection*).** La exportación municipal (US-28)
escribe en el CSV el título del reporte, que escribe cualquier ciudadano, el
nombre de la categoría (las de distrito las nombra el funcionario) y el
responsable (texto libre del funcionario). Excel evalúa como fórmula una
celda de CSV que empieza por `=`, `+`, `-`, `@`, tabulador o retorno de carro,
aunque vaya entre comillas. Con QA-1 M-5 el CSV lleva BOM UTF-8 precisamente
para que el funcionario lo abra con doble clic en Excel.

**Por qué importaba.** Un ciudadano podía crear un reporte titulado
`=HYPERLINK("http://…";"Ver")` (o con funciones de llamada a otros
programas en versiones de Excel que las permiten) y la fórmula se ejecutaba en
el equipo del funcionario que exportaba la bandeja de su distrito: un enlace a
un sitio malicioso con apariencia de dato municipal, o la filtración del
contenido de otras celdas.

**La corrección.**

- El servicio marca como `reportes/port/TextoLibre` cada celda que escribió
  una persona (título, categoría y responsable). Lo que arma el sistema
  (estado, severidad, fechas y ubicación) va como `String` y los números como
  `Number`.
- `CsvReportesExportador` antepone un apóstrofo (`'`) a las celdas
  `TextoLibre` que empiezan por uno de esos caracteres, la neutralización que
  recomienda OWASP, y después escapa las comillas (RFC 4180). La ubicación de
  Lima empieza por `-` pero la arma el sistema, así que no se toca.
- `ExcelReportesExportador` no necesita el apóstrofo: `setCellValue(String)`
  crea una celda de **texto**, que Excel nunca evalúa, y el texto va tal cual.
- Se marca por celda y no se neutraliza en el servicio porque la regla es del
  formato: un apóstrofo en el XLSX se vería como un carácter más del título.

**Regresión:** `ExportadoresSinInyeccionDeFormulasTest` (Surefire) recorre los
seis caracteres, el escape de comillas después del apóstrofo, que no se toca
el texto normal, la ubicación ni los números, y que en el XLSX una celda
`=1+1` es de tipo texto. `ExportarReportesIT` lo comprueba de punta a punta:
un título `=HYPERLINK(…)` y otro `-2+3 …` y un responsable `@cuadrilla` salen
con apóstrofo en el CSV, la ubicación sin él, y en el XLSX el título `=1+1 …`
es una celda de texto sin apóstrofo.

### SEC-05 — El API se podía alcanzar sin pasar por Cloudflare

**Detectado:** 2026-10-28, al revisar las defensas del despliegue (v0.7.x en
producción).
**Estado:** corregido en el código (DEP-14, para la v0.8.0) y cubierto por
tests. En producción se activa con la *Transform Rule* de Cloudflare y
`ORIGEN_SECRETO`, en ese orden (runbook).

**El problema.** El borde de Railway enruta por el `Host`. Una petición con
`Host: api.ciudadviva.app` enviada directo a su IP llegaba al backend sin
pasar por Cloudflare: 200 en `/api/categorias`. Borrar el dominio
`*.up.railway.app` no lo cerraba.

**Por qué importaba.** El WAF, la regla «solo rutas de la app» y el límite
de 30 escrituras cada 10 s por IP están en Cloudflare, y el backend no limita
por IP. Quien se saltaba el proxy podía mandar ráfagas de escrituras (inicio
de sesión, adhesiones, reportes) sin ningún límite, o probar rutas que la
regla de Cloudflare no deja pasar.

**La corrección.** Cloudflare agrega un encabezado con un secreto, y el
backend, en un filtro que corre antes que Spring Security, rechaza con 403
lo que no lo trae. Ver
[Encabezado de origen (DEP-14)](#encabezado-de-origen-dep-14).

**Regresión:** `EncabezadoDeOrigenFilterTest`, `EncabezadoDeOrigenConfigTest`,
`EncabezadoDeOrigenIT`, `ArranqueEncabezadoDeOrigenIT` y `PerfilProdIT` (el
detalle, en esa sección).

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
| Ocultar o restablecer un reporte (NC-11a, solo el ADMIN) | lo saca o lo devuelve: la vista excluye los ocultos desde V21, con sus resueltos y sus calificaciones (`ReporteVisibilidadCambiadaEvent`). Ocultar **solo la foto** no mueve nada y no refresca |

**No** disparan refresco, deliberadamente: adherirse a un reporte existente
(US-09 no crea una fila nueva, así que el total no cambia) y los estados
`RECIBIDO` / `EN_PROCESO` / `RECHAZADO`, que no alteran ni el total ni los
resueltos.

La lección que vale registrar: al elegir un modelo dirigido por eventos, la
parte frágil no es el mecanismo sino **la enumeración de los eventos**. Aquí
se enumeraron los que cambian el *numerador* y se pasó por alto el
*denominador*.

## Fotos: dos visibilidades, dos buckets y sin EXIF (DEP-12)

Las fotos **no todas tienen la misma visibilidad**, y esa diferencia es de
seguridad, no de orden:

| | Foto de reporte (US-05) | Foto de perfil (US-30) |
|---|---|---|
| Qué es | Evidencia de un daño vial | Dato personal del ciudadano |
| Dónde (`local`) | `<fotos-dir>/reportes` | `<fotos-dir>/perfiles` |
| Dónde (`s3`) | bucket `FOTOS_S3_BUCKET_REPORTES` (privado) | bucket `FOTOS_S3_BUCKET_PERFILES` (privado) |
| URL | `/media/fotos/reportes/{uuid}.jpg` | `/api/perfiles/fotos/{uuid}.jpg` |
| Acceso | **Público**, sin token | **Solo el dueño** |
| Mecanismo | resource handler con `ResourceResolver` propio (`reportes/infra/FotosDeReporteWebConfig`, antes `common/config/WebMvcConfig`) | `PerfilFotoController` |

**Por qué las de reporte son públicas:** el mapa y la búsqueda (US-10/US-12)
ya son públicos y devuelven `fotoUrl`; si la foto exigiera token, el mapa
mostraría imágenes rotas a cualquier visitante. Desde NC-11a, públicas **si
son visibles**: la foto que ocultó el ADMIN, la de un reporte oculto y la que
no es de ningún reporte responden 404 (ver «Ocultar y denunciar (NC-11a)»).

**Por qué mecanismos distintos.** Una foto de reporte no tiene regla de
autorización: el resource handler de Spring resuelve content-type,
`Last-Modified` y los GET condicionales, las peticiones de rango y el
rechazo de rutas con `..` sin código propio. Una foto de perfil exige
comprobar que quien la pide **es su dueño** — autorización *por instancia*,
no por patrón de ruta. `SecurityConfig` protege rutas por rol y no puede
expresarlo, así que hace falta un controlador que lea al usuario autenticado
y lo compare con el dueño real del archivo.

**Defensa contra path traversal en el endpoint dedicado.** Al no heredar la
protección del resource handler, hay que replicarla. El nombre que llega en
la URL **nunca se usa para tocar el almacenamiento**: solo se *compara*
contra el nombre registrado en `usuario.foto_url`, y la lectura se hace con
el valor registrado. Una entrada como `../../../etc/passwd` jamás coincide
con un UUID almacenado, así que se rechaza antes de llegar al disco o al
bucket — más robusto que sanear la cadena, porque no hay que anticipar todas
las formas de escaparse. Los adaptadores añaden una segunda barrera: el local
verifica que la ruta quede dentro del directorio y el S3 solo acepta nombres
`<uuid>.<ext>` (`FotoStorageService.NOMBRE_DE_ARCHIVO`).

**404 en vez de 403** cuando el archivo pedido no es del solicitante: es una
desviación deliberada del criterio general del proyecto, porque un 403
confirmaría que ese archivo existe y se trata de fotos de personas.

### Dos adaptadores, las mismas URL

`common/port/FotoStorageService` tiene dos implementaciones, elegidas por
`app.storage.tipo` (`FOTOS_ALMACEN`) con `@ConditionalOnProperty`
(propuesta aceptada `project-context/decisions/propuestas/2026-10-21-fotos-r2.md`):

| `app.storage.tipo` | Adaptador | Dónde se usa |
|---|---|---|
| `local` (por defecto; fijo en el perfil `test`) | `common/infra/LocalFotoStorageService` | Desarrollo y tests: sin credenciales ni red. |
| `s3` | `common/infra/S3FotoStorageService` | Producción contra **Cloudflare R2**; CI y pruebas manuales contra un emulador S3. |

- **Por qué R2 y un bucket privado.** En un contenedor de Railway el disco no
  persiste entre despliegues: sin almacenamiento externo, cada versión
  borraba las fotos. R2 no cobra egreso, su capa gratuita cubre de sobra la
  tesis (10 GB, 1 M de escrituras y 10 M de lecturas al mes) y habla la API
  de S3.
- **Se llama `S3…` y no `R2…`** porque el mismo adaptador habla con R2 en
  producción y con el emulador en las pruebas: tecnología más puerto
  (ARCHITECTURE.md §4.5).
- **Mismas URL que con el disco.** El adaptador S3 devuelve las mismas
  cadenas que el local, y el backend lee del bucket para servirlas. El
  navegador nunca habla con R2: **sin cambio de contrato ni de CSP**, y
  `reporte.foto_url` y `usuario.foto_url` siguen guardando la URL relativa.
  Para eso el puerto suma `cargarFotoReporte`, y `WebMvcConfig` (desde NC-11a,
  `reportes/infra/FotosDeReporteWebConfig`) registra el
  mismo *resource handler* de antes con un `ResourceResolver` propio que la
  llama (antes apuntaba al directorio local). Es **un solo camino** para los
  dos adaptadores: el IT de siempre (`FotoReporteIT`) prueba el que corre en
  producción. Un nombre que no sea `<uuid>.<ext>` responde 404 sin llamar al
  almacenamiento.
- **Dos buckets y no uno con prefijos.** Hoy los dos son igual de privados,
  pero un error de configuración que hiciera público uno no expondría las
  caras de los ciudadanos, y la migración futura a una CDN (abajo) consiste
  en publicar solo el de reportes. Cuesta lo mismo: R2 cobra por GB y por
  operación, no por bucket. El arranque falla si los dos nombres coinciden.
- **Configuración del cliente** (AWS SDK for Java v2, según el ejemplo
  oficial de Cloudflare): `endpointOverride` y región `auto`;
  `chunkedEncodingEnabled(false)`, sin lo cual `PutObject` falla en R2 con
  403 `SignatureDoesNotMatch`; checksums solo cuando la operación los exige
  (`WHEN_REQUIRED`), porque desde la 2.30 el SDK calcula CRC32 en cada
  subida y R2 tuvo un incidente con eso; timeouts de 5 s por intento y 10 s
  por llamada. Del SDK entra solo el módulo `s3` con el cliente HTTP de
  `java.net.URLConnection` (sin Apache HttpClient ni Netty, que el SDK trae
  por defecto): una llamada síncrona por petición no necesita más, y la
  imagen tiene un límite de 400 MB.
- **Lectura en memoria.** Después del saneado una foto pesa unos cientos de
  KB, así que el adaptador S3 la lee entera (`GetObject`) y la entrega como
  recurso en memoria con su nombre y su fecha: `contentLength()`, el
  `Last-Modified` y los rangos funcionan sin una segunda llamada.
- **Caché.** Las públicas salen con `Cache-Control: max-age=2592000, public,
  immutable` (30 días; el nombre es un UUID, así que el contenido de una URL
  nunca cambia y el navegador no revalida al recargar) y `Last-Modified`
  (un GET condicional responde 304). Las de perfil, `private`. Cada vista
  que no resuelve la caché del navegador o del Service Worker es una lectura
  de R2 (operación clase B).
- **Errores del bucket.** Un objeto que no existe es `null` → 404. Si R2 no
  responde, 503 con mensaje (`ServicioNoDisponibleException`): la PWA lo
  muestra y no lo toma como error de red, así que el reporte no queda en la
  cola offline.
- **La foto de perfil reemplazada se borra** (`eliminarFotoPerfil`): ya no
  tiene finalidad y es un dato personal (Ley N.° 29733). `AuthService`
  publica `auth/event/FotoDePerfilReemplazadaEvent` y
  `auth/listener/FotoDePerfilReemplazadaListener` lo atiende **después del
  commit** (si el cambio de perfil hiciera rollback, el ciudadano
  conservaría la anterior) y solo encola
  `PerfilFotoService#eliminarFotoReemplazada`, que es `@Async` en el executor
  acotado de `AsyncConfig`: el borrado en R2 es una llamada HTTP y, como las
  notificaciones (D-13), no corre en el hilo de la petición ni con la
  conexión a la base tomada. Nunca lanza: con la cola llena o R2 caído se
  registra y la foto queda huérfana; el perfil no se ve afectado.

### Saneado: sin EXIF, orientada y a 2048 px

Las fotos de los teléfonos traen **EXIF**: la ubicación GPS del teléfono, el
modelo del equipo y la fecha. La foto de un reporte es pública, así que
publicarlo expondría dónde vive o por dónde anda quien reporta. Toda foto
pasa por `common/port/SaneadorDeImagen` (implementado por
`common/infra/ImageIoSaneadorDeImagen`) antes de guardarse: la de perfil, al
principio de `almacenarFotoPerfil` de **los dos** adaptadores; la de reporte,
en `ReporteService#crear`, antes de subirla, y el adaptador la guarda tal
cual con `almacenarFotoReporteSaneada` (BE-11, abajo). El saneado devuelve
un tipo propio, `common/port/FotoSaneada`, y ese método solo acepta ese
tipo: una foto cruda del cliente no compila donde se espera una saneada. Como
un record no puede ocultar su constructor, una regla de ArchUnit
(`FotoSaneadaSoloDelSaneadoTest`) exige que en el código de producción solo
un `SaneadorDeImagen` construya una `FotoSaneada`. Así una foto no puede
publicarse con su EXIF por error. El saneado:

1. Valida la extensión (jpg, jpeg, png, webp) y luego **el contenido**: el
   lector se elige por los bytes, no por el nombre, y solo se aceptan JPEG,
   PNG y WEBP. Antes solo se miraba la extensión.
2. Lee las dimensiones **sin decodificar** y rechaza más de 40 MP (una
   "bomba de descompresión": pocos bytes que se expanden a gigas).
3. Decodifica **ya submuestreada** (`ImageReadParam#setSourceSubsampling`,
   paso `n = ⌈lado mayor / 2048⌉`): el lector descarta filas y columnas al
   leer, así que la imagen en memoria nunca pasa de 2048 px por lado (~12 MB)
   aunque la foto tenga 40 MP (~120 MB decodificada entera). El paso es
   entero, así que una foto de 4100 px queda en 1367 px y no en 2048.
4. Aplica la **orientación EXIF** a los píxeles (si no, al quitar el EXIF la
   foto se vería girada). Solo en JPEG, que es lo que producen las cámaras
   (Safari convierte HEIC a JPEG al subir).
5. La escribe como **JPEG de calidad 0,85 sin metadatos**. Una PNG con
   transparencia queda con fondo blanco.

| Opción | Por qué sí o no |
|---|---|
| **Recodificar** (elegida) | Elimina *todo* metadato (EXIF, GPS, XMP, IPTC, notas del fabricante) sin conocer cada formato; valida que el archivo sea una imagen; baja de 3–5 MB a unos cientos de KB (menos almacenamiento, egreso y heap); entrada uniforme para el modelo de NC-03. Cuesta algo de calidad, imperceptible a 0,85 para la evidencia de un bache. |
| Quitar metadatos formato por formato | Sin pérdida, pero exige código por formato y es fácil olvidar una variante (XMP dentro de APP1, GPS en XMP); no valida el contenido ni reduce el peso. |

- **Lectores de TwelveMonkeys** (BSD-3) para JPEG (CMYK y archivos con
  errores tolerables) y WEBP, que el JDK no lee; su lector de metadatos lee
  la orientación. El registro de ImageIO es global, así que el adaptador
  llama a `ImageIO.scanForPlugins()` al arrancar y registra en el log qué
  lector atiende cada formato.
- **Siempre `.jpg`.** Las URL nuevas terminan en `.jpg`; para la PWA siguen
  siendo una cadena opaca.
- **Errores.** Un archivo que no se puede decodificar da el mismo error que
  una extensión no permitida (`BusinessException`, **409**, mensaje que
  empieza con «Formato de foto no permitido»), así que la PWA no cambia; más
  de 40 MP, 409 «La foto supera el máximo de 40 megapíxeles». Un decodificador
  que falla con un archivo corrupto (desde `IIOException` hasta
  `IndexOutOfBounds`) también es 409: el error es del cliente, no un 500.
- **Determinista.** Los mismos bytes dan los mismos bytes (mismo lector, mismo
  paso, giros exactos con vecino más cercano, mismo codificador y calidad).
  D-08 depende de eso: desde NC-04 la vista previa pasa por el mismo
  saneador y la sugerencia oficial lee la foto guardada, ya saneada (ver
  [Sugerencia de categoría](#sugerencia-de-categoría-por-la-foto-nc-04-fase-0)).

**Memoria acotada.** El API corre con `-Xmx512m` (runbook). Cada saneado en
curso ocupa el archivo subido (hasta 10 MB), la imagen decodificada
(≤ 12 MB), la orientada si hay que girarla (≤ 12 MB) y el JPEG de salida
(~0,5 MB). Un **semáforo** limita los saneados simultáneos
(`app.storage.saneado.max-concurrentes`, 2 por defecto): una subida espera
turno hasta 10 s y, si no lo obtiene, responde **503** «Hay muchas fotos
procesándose en este momento» (no un error de red: la PWA muestra el mensaje
y el reporte no entra a la cola offline).

**Tope de 16 MP para lo que no se decodifica submuestreado.** El tope de
40 MP supone que el lector descarta filas al leer. Hay archivos cuyo
decodificador retiene la imagen entera, o todos sus coeficientes, antes de
reducirla; para esos el tope baja a **16 MP**, también sin decodificar
(`ImageIoSaneadorDeImagen#seDecodificaEntera`, que solo lee los
encabezados):

- **JPEG no secuencial** (el primer marcador SOF no es `SOF0` ni `SOF1`):
  progresivo (`SOF2`), sin pérdida, jerárquico o aritmético. Con un
  progresivo, la librería nativa del JDK guarda los coeficientes DCT de toda
  la imagen **fuera del heap** (3 a 6 bytes por píxel: ~240 MB con 40 MP,
  ~96 MB con 16 MP): no provoca un `OutOfMemoryError` de Java, pero suma
  memoria al contenedor. El lector sin pérdida de TwelveMonkeys no
  submuestrea. Las cámaras de los teléfonos producen JPEG secuencial
  (*baseline*); los progresivos vienen de la web o de algunas aplicaciones.
- **WEBP sin pérdida** (`VP8L`), **animado** (`ANMF`) o **con un canal alfa
  comprimido sin pérdida** (`ALPH` con compresión 1, aunque la imagen sea
  `VP8` con pérdida): el decodificador arma un raster entero de 4 bytes por
  píxel (64 MB con 16 MP). Un teléfono no produce estos archivos.

### La foto del reporte, fuera de la transacción (BE-11)

Hasta BE-11, `ReporteService#crear` era un `@Transactional` que saneaba y
subía la foto adentro: con R2, ~100–500 ms de red, y antes hasta 10 s de
espera de turno de saneado, con una conexión del pool tomada (con 16
creaciones con foto simultáneas el pool se agotaba, ver [Prueba de
memoria](#prueba-de-memoria-dep-12)). Ahora `crear` no abre una transacción
propia y sigue este orden:

1. El usuario y el reenvío idempotente (US-06), cada lectura en su propia
   transacción corta. Un reenvío con respuesta guardada vuelve aquí, sin
   sanear, moderar ni subir nada.
2. Los campos (NC-02) y, desde NC-10b, el texto sin groserías, sin tocar la
   base.
3. La foto se sanea **una sola vez**, se **modera** (NC-10b: una foto
   rechazada o que no se pudo revisar no llega a subirse) y se sube con
   `FotoStorageService#almacenarFotoReporteSaneada`, que la guarda **tal
   cual**, sin volver a sanearla: los mismos bytes que vio la vista previa
   (D-08). Todo esto sin transacción ni conexión tomada.
4. Recién entonces la transacción: categoría, distrito, deduplicación
   (US-09), reporte o adhesión, la clave de idempotencia y
   `ReporteCreadoEvent`.
5. Al volver de ella, la foto se borra si ningún reporte confirmado la usa.

**La compensación** (`reportes/service/FotoProvisional`). La foto subida se
registra como `TransactionSynchronization` de esa transacción, y
`afterCompletion` da su desenlace real:

| Desenlace de la transacción | ¿La usa el reporte nuevo? | La foto |
|---|---|---|
| Confirmada | Sí | Se conserva |
| Confirmada | No: adhesión (US-09) o reenvío que se cruzó (US-06) | Se borra |
| Revertida | — | Se borra |
| Desconocido (falló el commit sin saber si llegó a la base) | Sí | Se conserva, con un WARN: un reporte publicado sin su foto es peor que un objeto huérfano |
| No llegó a empezar (sin conexión en el pool) | — | Se borra |

- **El borrado no va dentro de `afterCompletion`.** Spring la llama antes de
  devolver la conexión al pool (`cleanupAfterCompletion` va después), y
  borrar en R2 es otra llamada de red. `afterCompletion` solo anota el
  desenlace; el borrado lo hace `FotoProvisional#resolver` apenas vuelve la
  transacción, ya sin conexión. Nunca lanza: si falla, queda un WARN con el
  nombre del objeto y la respuesta al ciudadano no cambia.
- **Transacción programática.** Tiene que empezar después de la subida y
  terminar antes de la compensación, dentro del mismo caso de uso. Un
  `@Transactional` en un método del mismo bean no se aplicaría (el proxy no
  intercepta llamadas internas), y partir el caso de uso en dos beans solo
  para eso escondería el orden. `ReporteService` usa el `TransactionTemplate`
  de Spring Boot (inyectado como `TransactionOperations`): el borde queda a la
  vista y sigue en `service/` (ARCHITECTURE.md §4.5).
- **`crear` no corre dentro de otra transacción.** Su transacción se uniría a
  la de afuera y no habría terminado al volver: la foto se decidiría antes de
  saber si el reporte se confirma. Lanza `IllegalStateException` antes de
  tocar nada. Se prefirió esa comprobación a
  `@Transactional(propagation = NEVER)`, que abre un ámbito con
  sincronización: ahí una consulta sin transacción propia ligaría un
  `EntityManager` al hilo, con su conexión, durante todo el método.
- **Preparado para la moderación (NC-10b, D-15).** El saneado y la subida
  son dos pasos separados en `crear`. La moderación va entre ellos, sobre la
  foto ya saneada y sin transacción, y una foto rechazada no llega a subirse.
  Como el puerto ya recibe la foto saneada (`FotoSaneada`), NC-10b no tiene
  que agregar ese método ni volver a sanear, y el puerto de moderación puede
  recibir el mismo tipo.

**Cambios de comportamiento, sin cambio de contrato.**

- La foto se sanea antes de saber si el pedido termina en adhesión. Un
  archivo que no es una imagen da el 409 de siempre también al adherirse
  (antes se descartaba sin mirarlo), y sin turno de saneado o con R2 caído
  una adhesión con foto da 503. Es el orden que pide NC-10b, que también
  revisa la foto de una adhesión.
- Si el pedido trae una foto inválida y además una categoría o una ubicación
  inválidas, ahora se responde primero el error de la foto. Los códigos de
  cada error son los mismos de antes.
- Una adhesión con foto sube la foto y la borra: dos llamadas a R2 que antes
  no había, sin conexión tomada.

**Lo que no cubre.** La foto de perfil todavía se sube dentro de la
transacción de `AuthService#editarPerfil` (deuda técnica). La prueba de carga
de 16 creaciones con foto simultáneas se repite al cerrar BE-12, que saca el
refresco del índice del hilo de la petición.

### Pruebas de las fotos

| Prueba | Tipo | Qué afirma |
|---|---|---|
| `ImageIoSaneadorDeImagenTest` | unitaria | Un JPEG con GPS y fabricante en el EXIF sale sin APP1; las 8 orientaciones EXIF dejan los píxeles donde se verían; una foto de 4200 px sale de 1400 px (submuestreo al decodificar, no reescalado); PNG transparente → fondo blanco; mismos bytes → mismos bytes; no imagen, GIF disfrazado o PNG roto → 409; más de 40 MP se rechaza **sin decodificar**, y más de 16 MP si el archivo se decodifica entero (JPEG progresivo, WEBP sin pérdida o con alfa sin pérdida, con encabezados armados en el test), mientras un JPEG secuencial o un WEBP con alfa sin comprimir de 20 MP no se rechaza por tamaño; con los turnos ocupados, la tercera espera y a los 10 s es 503, y si un turno se libera a tiempo, pasa. |
| `S3FotoStorageServiceTest` | unitaria, `S3Client` simulado | Cada foto a su bucket con `image/jpeg`; la de reporte se sube tal cual, sin llamar al saneado (BE-11), y la de perfil saneada; la misma URL que el local; nombres que no son `<uuid>.<ext>` no llegan al bucket; inexistente → `null`; bucket caído → 503; `eliminarFotoReporte` borra del bucket de reportes y no lanza; no arranca sin endpoint, token o bucket, ni con un solo bucket para las dos visibilidades. |
| `LocalFotoStorageServiceTest` | unitaria | Lo de antes, más que se guarda el JPEG saneado, que la foto de reporte ya saneada se guarda sin volver a sanearla (BE-11) y que `cargarFotoReporte`, `eliminarFotoPerfil` y `eliminarFotoReporte` no salen del directorio. |
| `FotoSaneadaTest` | unitaria | Una foto saneada no puede estar vacía, pasa al clasificador con los mismos bytes y no vuelca sus bytes en un log. |
| `FotoSaneadaSoloDelSaneadoTest` | ArchUnit, sin congelar | En el código de producción, solo un `SaneadorDeImagen` construye una `FotoSaneada` (BE-11). |
| `NombreDeArchivoDeFotoTest` | unitaria | `FotoStorageService.nombreDeArchivo` saca `<uuid>.<ext>` de una URL del servidor y da `null` para lo demás (vacío, `..`, otro nombre u otra extensión), así que nada de eso llega al almacenamiento. |
| `FotoProvisionalTest` | unitaria, gestor de transacciones de prueba | BE-11: la foto subida se conserva si la usa un reporte confirmado o si el desenlace es desconocido; se borra si la transacción se revierte, si se confirma sin usarla o si no llega a empezar; el borrado ocurre después de la transacción, nunca dentro. |
| `FotoFueraDeTransaccionIT` | IT (`local`) | BE-11 con PostGIS: el saneado, la subida y el borrado corren sin transacción y sin recursos transaccionales en el hilo; una reversión en el commit, una adhesión y un reenvío que se cruza con la subida no dejan su foto; un reenvío idempotente no sanea ni sube otra vez; `crear` dentro de una transacción se rechaza sin tocar nada. |
| `FotoReporteIT`, `FotoPerfilIT` | IT (`local`) | Misma URL y visibilidad; la foto descargada ya no trae EXIF y se ve derecha; `Cache-Control`, 304 y 206; nombres raros → 404; foto inválida → 409; al reemplazar la foto de perfil, la anterior se borra. |
| `ArranqueAlmacenDeFotosIT` | IT | Con el perfil `prod` y sin `FOTOS_ALMACEN`, la aplicación no arranca. |
| `ValidacionAlmacenDeFotosTest` | unitaria, sin base | `local` y `s3` (sin distinguir mayúsculas) pasan; otro valor (`r2`, vacío, `s3 ` con espacio) no arranca con un mensaje que nombra `FOTOS_ALMACEN` y los valores admitidos, también con la aplicación real y antes de tocar la base. |
| `FotoDePerfilReemplazadaListenerTest` | unitaria | El listener solo encola el borrado de la foto reemplazada; ni la cola llena ni un almacenamiento caído lanzan. |
| `S3FotoStorageServiceIT` | IT, **solo si existe `FOTOS_S3_TEST_ENDPOINT`** | La aplicación entera con `app.storage.tipo=s3` contra un servicio S3 real: cada foto solo en su bucket, servida por la misma URL e idéntica a la del bucket, sin EXIF; la de perfil solo para su dueño; la reemplazada se borra del bucket; inexistente → 404; una adhesión o una creación que se revierte no dejan su objeto en el bucket (BE-11). Sin la variable se omite y la suite local no cambia. |

El emulador es **Adobe S3Mock** (Apache-2.0), no MinIO: el repositorio de
MinIO quedó archivado y su imagen ya no se distribuye, y LocalStack exige un
token. Para correr el IT:

```bash
docker run -d --rm -p 9090:9090 --name s3mock adobe/s3mock:5.2.3
FOTOS_S3_TEST_ENDPOINT=http://localhost:9090 mvn verify -Dit.test=S3FotoStorageServiceIT
docker stop s3mock
```

Los buckets se crean si no existen. **Antes del primer despliegue** conviene
correrlo una vez contra un bucket R2 de prueba (`FOTOS_S3_TEST_ENDPOINT`,
`FOTOS_S3_TEST_ACCESS_KEY_ID`, `FOTOS_S3_TEST_SECRET_ACCESS_KEY`,
`FOTOS_S3_TEST_BUCKET_REPORTES`, `FOTOS_S3_TEST_BUCKET_PERFILES`, con los
buckets ya creados): es lo único que confirma contra R2 la configuración del
cliente (*chunked encoding* y *checksums*), que el emulador no verifica.

### Prueba de memoria (DEP-12)

**2026-10-22.** La imagen de `backend/Dockerfile` con el
`JAVA_TOOL_OPTIONS` del runbook (`-Xms256m -Xmx512m -XX:+UseSerialGC
-XX:+ExitOnOutOfMemoryError`, más `-Xlog:gc` para medir), `FOTOS_ALMACEN=s3`
contra S3Mock y un PostGIS vacío y temporal, en una red de Docker propia.
Fotos generadas tipo cámara de 24, 32 y 40 MP, de 8,2 a 8,4 MB, dos con
orientación EXIF 6 y 8; cada subida de un ciudadano distinto y en un punto
distinto (para que sean reportes nuevos y no adhesiones):

| Subidas simultáneas | Respuestas | Tiempo | Pico de heap usado (antes de GC) | Heap comprometido |
|---|---|---|---|---|
| **8** (criterio de DEP-12) | **8 × 201** | 0,8–1,3 s | **230 MB** de 512 | 247 MB |
| 16 | 13 × 201, 2 × 401, 1 × 500, todas a los ~30 s | ~30 s | 301 MB | 412 MB |

Ningún `OutOfMemoryError` ni reinicio. Las fotos guardadas pesan 465–621 KB,
sin EXIF. **El límite con 16 no es la memoria sino el pool de conexiones**
(Hikari, 10): cada creación retiene su conexión mientras sanea y sube la
foto, y al confirmar, `IndiceDesempenoRefreshListener` (`AFTER_COMMIT`)
pide una **segunda** conexión para el `REFRESH MATERIALIZED VIEW` en
`REQUIRES_NEW`, todavía con la primera tomada. Con 10 creaciones en ese
punto el pool se bloquea hasta el timeout de 30 s («Connection is not
available»): los refrescos fallan (se registran y el reporte ya está
creado), y lo que no consigue conexión en ese lapso falla también (el
filtro JWT no puede cargar al usuario → 401; una transacción que no puede
empezar → 500). Las mismas 16 creaciones **sin foto** terminan en 201 en
menos de 0,5 s: el saneado y la subida dentro de la transacción alargaban
las transacciones lo suficiente para que el refresco existente agotara el
pool. **BE-11 sacó el saneado y la subida de la transacción** (ver [La foto
del reporte, fuera de la
transacción](#la-foto-del-reporte-fuera-de-la-transacción-be-11)); queda
sacar el refresco del hilo de la petición (BE-12, como las notificaciones,
D-13). Mientras tanto, un pool más grande en producción amplía el margen.
Esta medición es anterior a BE-11 y se repite al cerrar BE-12.

### Migración futura a una CDN

Cuando el egreso de Railway pese (las fotos pasan por el API): conectar un
dominio propio **solo al bucket de reportes** con la caché de Cloudflare,
responder 301 desde `/media/fotos/reportes/<archivo>` (las URL guardadas
siguen sirviendo) y sumar el origen a la CSP de la PWA. El bucket de perfiles
sigue privado y servido por el API. Las URL prefirmadas de R2 no sirven para
esto: solo funcionan con el dominio de la API S3.

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
{"titulo": "Ciudad Viva: tu reporte está en proceso",
 "cuerpo": "Tu reporte #42 está en proceso.",
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

Dos, con nombre, para el trabajo posterior al commit:

- **El general** (`ejecutorAsincrono`, hilos `viasegura-async-*`,
  `@Async(AsyncConfig.EJECUTOR)`): los avisos y los correos. Es `@Primary`,
  así que también es el executor por defecto de cualquier `@Async` sin
  nombre.
- **El de las sugerencias** (`ejecutorSugerencias`, hilos
  `viasegura-sugerencia-*`, `@Async(AsyncConfig.EJECUTOR_SUGERENCIAS)`,
  desde NC-04c): solo la sugerencia oficial de categoría de D-08. Ver abajo
  por qué va aparte.

Los dos reemplazan al `applicationTaskExecutor` de Spring Boot (Boot solo
crea el suyo si no hay ningún `Executor`).

| Parámetro | General | Sugerencias |
|---|---|---|
| Hilos | 2 base, hasta 4 (`ASYNC_HILOS_BASE`, `ASYNC_HILOS_MAX`) | 2 fijos (`ASYNC_SUGERENCIAS_HILOS`) |
| Cola | 100 tareas (`ASYNC_COLA`) | 100 tareas (`ASYNC_SUGERENCIAS_COLA`) |
| Cola llena | **se rechaza** (`TaskRejectedException`): quien encola registra qué se pierde y la descarta | igual |
| Apagado | espera hasta 10 s a las tareas en curso y corre la cola | deja terminar las que corren y **descarta la cola** (ver abajo) |

**Por qué la sugerencia oficial tiene su propio executor (NC-04c).** Desde
NC-04c espera hasta 10 s un turno del servicio de inferencia (ver «Espera de
turno de la sugerencia oficial»), y mientras espera ocupa su hilo. En el
executor general, que en la práctica trabaja con sus 2 hilos base (el pool
solo crece hacia 4 con la cola de 100 llena), dos sugerencias esperando lo
dejarían sin hilos: los correos de confirmación y de recuperación y los
avisos quedarían en cola detrás de ellas, y con una carga sostenida de
vistas previas cada sugerencia esperaría el plazo entero (2 tareas cada
~13 s). Subir los hilos del general no lo resuelve: más hilos también son
más sugerencias a la vez, que ocuparían los 4 turnos y dejarían sin
sugerencia a las vistas previas. Con un executor aparte (un *bulkhead* de
hilos, como el semáforo lo es de llamadas):

- esperar un turno solo retrasa a otras sugerencias, nunca un correo ni un
  aviso;
- con **2 hilos fijos**, a lo sumo 2 sugerencias oficiales llaman a la vez,
  así que de los 4 turnos del adaptador quedan 2 para las vistas previas,
  igual que antes de NC-04c. Por eso `ASYNC_SUGERENCIAS_HILOS` debe estar
  entre 1 y 3: con 4 o más no arranca (lo valida `InferenciaHttpAdapter`, en
  `clasificacion`, porque `common` no puede depender de ese módulo). Hilos
  fijos (base = máximo) porque un pool que solo crece con la cola llena se
  quedaría en los base de todos modos;
- la cola de 100 guarda solo el id del reporte (la foto se descarga al
  correr), así que no pesa en memoria. En el peor caso, con cada tarea
  esperando el plazo entero, se vacía en unos 100 / 2 × 13 s ≈ 11 minutos, y
  una sugerencia tardía sigue sirviendo: es interna y no la espera nadie.
  El servicio infiere de a una foto (≈0,3 s cada una, unas 3 por segundo),
  así que dos hilos ya lo mantienen ocupado, muy por encima de los reportes
  con foto que se esperan en el piloto;
- **al apagar** (un redespliegue) no espera a la cola: con
  `waitForTasksToCompleteOnShutdown` en `false`, el valor por defecto de
  Spring, el cierre del contexto primero pausa el executor y espera a que
  terminen las sugerencias que corren (como mucho 10 s de espera más 3 s de
  llamada, dentro de los 30 s por fase de Spring), antes de que se cierre el
  pool de conexiones; después, al destruirlo, descarta la cola e interrumpe
  lo que quede. Una tarea que un hilo ya había tomado de la cola arranca
  interrumpida y `SugerenciaCategoriaService` no hace nada. Las sugerencias
  encoladas se pierden, como cualquier sugerencia rechazada. El general, en
  cambio, corre su cola al apagar (son correos y avisos), con el plazo de
  10 s. Con la regla del general, las sugerencias correrían la cola entera
  durante el apagado, y lo que pasara del plazo escribiría con el pool ya
  cerrado (hallazgo de la revisión del 28/10).

Cuesta dos hilos más, dormidos la mayor parte del tiempo.

Con la cola llena la tarea **nunca** corre en el hilo que la pidió (no se usa
`CallerRunsPolicy`): eso le devolvería al funcionario la latencia de la red
justo cuando el sistema está saturado. `ReporteEstadoCambiadoListener` atrapa
el rechazo y deja un WARN con el reporte, el ciudadano y el estado del aviso
perdido. Perder un aviso en ese caso se acepta: el reporte y su historial no
dependen de él. Lo mismo hacen los correos de recuperación y de soporte
(DEP-08): `RecuperacionSolicitadaListener` y `TicketRespondidoListener`
encolan en el executor general y, si los rechaza, registran el id del token
o del ticket (ver «Correo saliente»), y `SugerenciaCategoriaListener`
registra el reporte cuya sugerencia se pierde si el de las sugerencias la
rechaza (NC-04).

**En los IT** los beans reales no existen (`@Profile("!test")`) y
`support/EjecutorSincronoTestConfig` registra dos con los mismos nombres (el
general, `@Primary` como el real) que corren cada tarea en un hilo nuevo y
**esperan a que termine**: los IT siguen
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

## Correo saliente (DEP-08)

Todo correo sale por un solo puerto, `common/port/CorreoSaliente`
(`enviar(MensajeCorreo)`), con dos adaptadores en `common/infra` que se eligen
con `app.correo.tipo` (`CORREO_TIPO`):

| Tipo | Adaptador | Dónde | Cómo |
|---|---|---|---|
| `smtp` (por defecto) | `SmtpCorreoAdapter` | local (Mailhog, UI en :8025) y los IT (GreenMail en el 3025) | `JavaMailSender` de Spring Boot con `spring.mail.*` (`MAIL_*`), timeouts de 5 s |
| `resend` | `ResendCorreoAdapter` | producción | `POST https://api.resend.com/emails` con `RestClient` y el `HttpClient` del JDK |

**Por qué un puerto, y por qué en `common`.** El plan de Railway bloquea el
SMTP saliente, así que en producción el correo va por HTTP, y cambiar de
proveedor tiene que ser solo configuración. El correo lo usan tres módulos
(`auth`: recuperación de contraseña, US-03, y desde NC-09 el enlace de
confirmación de la cuenta; `soporte`: respuesta a un ticket,
US-25; `notificaciones`: aviso de cambio de estado, US-16), y D-11 reserva
`common/port` para la E/S que usan dos o más. En `notificaciones` crearía el
ciclo `auth` → `notificaciones` → `auth`. Ninguna clase fuera de
`SmtpCorreoAdapter` usa `JavaMailSender`: lo comprueba
`CorreoSoloPorElPuertoTest` (ArchUnit). El proveedor (Resend y no Brevo) lo
eligió el usuario; la comparación está en
`project-context/decisions/propuestas/2026-10-21-correo-saliente-http.md`.

**El mensaje.** `MensajeCorreo` lleva destinatario, asunto, texto y una
etiqueta (`recuperacion`, `confirmacion-correo`, `soporte` o `aviso-reporte`), pero no el remitente:
lo fija el adaptador desde `NOTIF_FROM`. La etiqueta viaja a Resend como
`tags: [{"name": "categoria", "value": …}]`, para filtrar en su panel, y nunca
es un dato personal. Su `toString` solo muestra la etiqueta, porque el texto
puede llevar un token.

**Resend sin SDK.** No suma dependencias (la imagen está al borde de los
400 MB): `Authorization: Bearer <CORREO_API_KEY>`, `Content-Type:
application/json` y un `User-Agent` propio, que Resend exige (sin él responde
403, error 1010). Timeouts de 3 s de conexión y 10 s de lectura, los de la
propuesta aceptada: el envío corre fuera de la petición, así que esperar más a
Resend no demora a nadie, y el timeout acota cuánto ocupa uno de los pocos
hilos del executor asíncrono un proveedor que no responde. Sin reintentos: llegarán
con NC-05 (ENVIO_CORREO, con registro de intentos). Una respuesta 4xx o 5xx, o
la falta de respuesta, se traduce a `CorreoNoEnviadoException` con el status y
el código de error de Resend (`validation_error`, `rate_limit_exceeded`…).
Nunca lleva el `message` de Resend (puede repetir el destinatario), el texto ni
la clave, y por eso tampoco encadena la excepción original.

**Dominio verificado.** Resend solo envía a cualquier destinatario desde un
dominio verificado (registros SPF y DKIM; DMARC recomendado). Desde
`onboarding@resend.dev` solo llega al correo del dueño de la cuenta, y a
cualquier otro responde 403. Por eso `NOTIF_FROM` es
`Ciudad Viva <no-reply@<dominio verificado>>`; mientras no haya dominio, el
correo de producción solo llega a esa dirección y cada envío rechazado deja un
WARN. Cuota del plan gratuito: 100 correos al día y 3.000 al mes.

**Arranque.** En `prod`, `CORREO_TIPO` y `NOTIF_FROM` no tienen valor por
defecto (`ArranqueCorreoIT`, `PerfilProdIT`): con el `smtp` de desarrollo,
cada correo fallaría contra `localhost:1025` sin que nada lo advirtiera al
desplegar. Con un valor que no elige ningún adaptador (`brevo`, `resend `
con un espacio), `common/config/ValidacionCorreoSaliente` (un
`BeanFactoryPostProcessor`, como `ValidacionAlmacenDeFotos` de DEP-12) lo
rechaza antes de crear ningún bean y de tocar la base, con un mensaje que
nombra `CORREO_TIPO` y los valores admitidos; sin ella el error sería un
genérico «required a bean of type CorreoSaliente». Con `resend`,
`ResendCorreoAdapter` no arranca sin `CORREO_API_KEY` o sin remitente, y el
mensaje nombra la variable sin repetir valores. El health sigue sin incluir
el correo (`management.health.mail.enabled: false`).

**Fuera de la petición y de la transacción (patrón de D-13).** Antes, la
recuperación de contraseña y la respuesta de soporte enviaban con
`JavaMailSender` dentro del `@Transactional`: un SMTP lento retenía una
conexión del pool, y un fallo revertía la operación y daba 500. Ahora:

1. El servicio guarda y publica un evento con **solo el id**:
   `auth/event/RecuperacionSolicitadaEvent(tokenId)` (el valor del token
   nunca viaja en un evento, que puede terminar en un log) o
   `soporte/event/TicketRespondidoEvent(ticketId)`.
2. El listener `AFTER_COMMIT` (`auth/listener/RecuperacionSolicitadaListener`,
   `soporte/listener/TicketRespondidoListener`) encola el envío en el executor
   acotado de `AsyncConfig` y vuelve.
3. En ese hilo pide el mensaje al servicio
   (`PasswordResetService#mensajeDeRecuperacion`,
   `TicketSoporteService#mensajeDeRespuesta`: una lectura corta en su propia
   transacción, que devuelve vacío si el token se usó o venció mientras
   esperaba) y lo envía por `CorreoSaliente` sin transacción abierta. El
   contenido del correo sigue en el servicio de su módulo; el listener no toca
   repositorios ni arma textos.
4. Un fallo se registra con el id (nunca el correo ni el token) y no se
   propaga.

Los listeners encolan con el `TaskExecutor` y no con `@Async` en el método:
con la cola llena el executor rechaza la tarea, y así el listener registra
**qué** correo se pierde, como `ReporteEstadoCambiadoListener`. Con `@Async`,
el rechazo lo atraparía la sincronización de la transacción de Spring y solo
quedaría un error genérico. `EmailNotificacionAdapter` (los avisos de US-16)
solo cambia el transporte: ya corría asíncrono y fuera de la transacción.

**Recuperación de contraseña: la misma respuesta exista o no la cuenta.**
`POST /api/auth/recuperar-password` responde 202 sin cuerpo en todos los
casos: cuenta inexistente, cuenta existente, proveedor caído y tope
alcanzado. Antes, un fallo del correo daba 500 solo con una cuenta existente
(revelaba cuáles existen), la respuesta tardaba lo que tardara el SMTP solo
con cuenta, y el log guardaba el correo no registrado (ya no se registra). Con
cuenta, la petición hace una consulta, toma el candado de la cuenta, cuenta e
inserta; sin cuenta, una consulta: la diferencia ya no depende del proveedor
de correo.

**Tope por cuenta.** Como máximo 3 tokens por cuenta en una hora (cuenta
`password_reset_token.created_at`, sin migración). El cuarto pedido no crea
token ni envía, y responde igual. Sin el tope, un bucle sobre el endpoint
gastaría la cuota diaria del proveedor (100 correos en Resend Free) y dejaría
sin avisos a todos. **Sin carreras:** antes de contar, el servicio toma un
candado consultivo de PostgreSQL por cuenta (`pg_advisory_xact_lock` sobre un
hash de `recuperacion-contrasena:<id>`, en
`PasswordResetTokenRepository#bloquearSolicitudesDeRecuperacion`), que se
libera con el commit. Los pedidos simultáneos de una misma cuenta pasan de a
uno, y cada conteo ya ve los tokens de los anteriores; los de cuentas
distintas no se esperan. Se eligió un candado consultivo y no
`SELECT … FOR UPDATE` sobre `usuario` porque no bloquea ninguna fila: ni la
edición del perfil ni los `INSERT` de otras tablas que referencian al usuario
esperan por él. `PasswordResetIT` lanza seis pedidos simultáneos para la misma
cuenta y comprueba que quedan tres tokens y llegan tres correos (sin el
candado quedaban seis).

**Respuesta de soporte: cambio de comportamiento.** Si el correo falla, la
respuesta del ADMIN queda guardada (el usuario la ve en `GET /mis-tickets`) y
el `PATCH` responde 200; antes se revertía y daba 500. El correo es un aviso,
no la respuesta.

**Tests.** `ResendCorreoAdapterTest`, sin red (`MockRestServiceServer`):
método, URL, cabeceras (`Authorization`, `User-Agent`, `Content-Type`), el
cuerpo JSON exacto, respuestas 4xx y 5xx con su status, la falta de respuesta
y dos casos con un socket local: un servidor que nunca responde (corta en el
timeout de lectura) y un puerto cerrado. Todos comprueban que el mensaje del
error no lleva la clave, el destinatario ni el token. Además
`SmtpCorreoAdapterTest`, `MensajeCorreoTest`, `ValidacionCorreoSalienteTest`
y los tests de los dos listeners (cola llena, token vencido, proveedor
caído). `ArranqueCorreoIT` arranca la aplicación real sin base: sin
`CORREO_TIPO` en `prod` y con `CORREO_TIPO=brevo`, no arranca. En los IT los
correos siguen por SMTP a GreenMail (`app.correo.tipo: smtp` literal en
`application-test.yml`, para que un `CORREO_TIPO` del entorno no mande la
suite a Resend): `PasswordResetIT` (misma respuesta con y sin cuenta, 202 con
GreenMail detenido y el token guardado, el tope, su ventana de una hora y
seis pedidos simultáneos) y `TicketSoporteIT` (la respuesta queda guardada
con el correo caído). El
executor de test espera a la tarea, así que al volver la petición el correo ya
llegó; igual se espera con `waitForIncomingEmail`, acotado.

**Verificación con la imagen (2026-10-22)**, perfil `prod` contra una base
temporal vacía: sin `CORREO_TIPO` no arranca (`Could not resolve placeholder
'CORREO_TIPO'`); con `CORREO_TIPO=resend` y sin `CORREO_API_KEY`, tampoco
(«Con CORREO_TIPO=resend falta CORREO_API_KEY…»). Con una clave inventada
arranca, y `POST /api/auth/recuperar-password` responde 202 sin cuerpo con y
sin cuenta (58 ms y 14 ms: la diferencia es el conteo y el `INSERT`, no el
proveedor). El envío corre en `viasegura-async-1`, y la API real de Resend lo
rechaza con 401 `validation_error` (clave inválida, no el 403 de un
`User-Agent` faltante), que queda como un WARN con el id del token.

## Captcha en el registro (NC-08)

> **De reCAPTCHA a Turnstile, decisión del usuario del 28/10 (NC-08b).** NC-08
> se hizo con la casilla de Google reCAPTCHA v2; antes de llegar a
> producción se reemplazó por **Cloudflare Turnstile**. El contrato del API
> no cambió (`RegistroRequest.captchaToken`, los mismos 409 y 503); cambiaron
> el adaptador, el valor de `CAPTCHA_TIPO` y la clave de `CAPTCHA_SECRET`.
> Los motivos:
>
> - **Privacidad.** Cloudflare ya es proveedor del sistema (DNS, correo
>   entrante y las fotos en R2) y Google no lo es: reCAPTCHA habría sumado un
>   encargado más que recibe datos del navegador de cada ciudadano que se
>   registra (Ley N.° 29733). Cloudflare declara que las señales que recoge
>   Turnstile son las estrictamente necesarias para detectar bots, «no para
>   identificar, perfilar ni dirigirse a ninguna persona» (política de
>   privacidad de Turnstile).
> - **Costo.** El plan gratuito de Turnstile no limita las verificaciones
>   (hasta 20 widgets por cuenta); el nivel gratuito de reCAPTCHA, hoy en
>   Google Cloud, cubre 10 000 evaluaciones al mes y después se cobra.
> - **Una CSP más simple.** El widget es un solo origen,
>   `https://challenges.cloudflare.com` (en `script-src`, `frame-src` y
>   `connect-src`, ver `frontend/README.md`), en lugar de las rutas de
>   `www.google.com`, `www.gstatic.com` y `recaptcha.google.com` que pedía
>   reCAPTCHA.
>
> `CAPTCHA_TIPO=recaptcha` ya no arranca, y el mensaje dice que cambiar.

`POST /api/auth/registro` exige, cuando está activo, el widget de
**Cloudflare Turnstile**. El frontend lo muestra con la clave del sitio
(pública) y envía su respuesta en `captchaToken`; el backend la comprueba
contra `POST https://challenges.cloudflare.com/turnstile/v0/siteverify` con la
clave secreta (`CAPTCHA_SECRET`). Es I/O externo, así que va detrás del puerto
`auth/port/VerificadorDeCaptcha`, con dos adaptadores elegidos por
`app.captcha.tipo` (`CAPTCHA_TIPO`), como los de correo:

| Valor | Adaptador | Uso |
|---|---|---|
| `turnstile` | `auth/infra/TurnstileAdapter` | Producción. |
| `ninguno` | `auth/infra/SinCaptchaAdapter` | Por defecto fuera de `prod`; fijo en los tests. `captchaToken` se ignora. |

**Por qué un widget visible.** Lo pidió el usuario, y el jurado puede verlo y
comprobarlo: el widget aparece en el formulario y sin resolverlo el registro
no pasa. Turnstile decide solo si basta con una comprobación invisible o si
pide un clic, pero siempre devuelve un token que el backend verifica: no hay
un puntaje que calibrar (como el de reCAPTCHA v3) sin datos de tráfico real.

**Falla cerrado.** Solo una respuesta `{"success": true}` de Cloudflare (y,
en `prod`, con un `hostname` de la PWA) deja pasar el registro:

| Respuesta de Cloudflare | Registro | Por qué |
|---|---|---|
| `success: true` y, si hay lista, un `hostname` de `CAPTCHA_HOSTNAMES` | sigue | — |
| `success: false` con `invalid-input-response`, `timeout-or-duplicate`, `missing-input-response` u otro código | **409** «No pudimos confirmar que no eres un robot. Vuelve a intentarlo.» | El token venció (dura 5 minutos), ya se usó o no es válido: el ciudadano lo corrige resolviendo el widget otra vez (la convención de `BusinessException`). |
| `success: true` en un `hostname` fuera de la lista | **409**, el mismo mensaje | El token no es de la PWA. |
| `success: false` con `invalid-input-secret`, `missing-input-secret`, `bad-request` o `internal-error` | **503** «No pudimos verificar el captcha en este momento…» | No es culpa del ciudadano (la clave secreta está mal o Cloudflare falló): un 409 «vuelve a intentarlo» lo haría reintentar sin remedio. |
| Error HTTP (Cloudflare responde **400** a una clave secreta inválida), timeout (3 s de conexión, 5 s de lectura), error de conexión, cuerpo ilegible, sin `success` booleano, o `success: true` sin `hostname` cuando hay lista | **503** | Lo mismo: `ServicioNoDisponibleException`, y la PWA lo muestra en vez de tomarlo como error de red. |

Un token ausente o en blanco es **409** «Confirma que no eres un robot», sin
llamar a Cloudflare. Dejar pasar el registro cuando Cloudflare no responde
abriría el registro masivo justo cuando un atacante consiga degradar esa
llamada. **Sin reintentos ni redirecciones:** el token es de un solo uso, y
reintentar un pedido que sí llegó daría `timeout-or-duplicate`. Por eso
tampoco se envía `idempotency_key`, que Cloudflare ofrece solo para
reintentar.

**El hostname, sí; la acción, no.** Cloudflare devuelve el `hostname` donde se
resolvió el widget y recomienda compararlo. Es una comparación exacta contra
una lista corta, así que se hace: `CAPTCHA_HOSTNAMES` (en `prod`, por defecto
`ciudadviva.app,www.ciudadviva.app`; sin comodines ni sufijos, sin
distinguir mayúsculas). Fuera de `prod` va vacía y no se compara, porque las
claves de prueba de Cloudflare responden `example.com`. De paso cubre un
error de despliegue: una clave secreta de **prueba** en producción aprobaría
cualquier token, pero con `hostname` `example.com`, así que el registro no
pasa y el log lo dice («la clave secreta es una de prueba de Cloudflare»).
Una entrada que no es un hostname (`https://…`, con puerto o comodín) no
arranca, porque no coincidiría nunca y bloquearía todos los registros. La
`action` del widget **no** se compara: la PWA tiene un solo widget (el
registro) y el token es de un solo uso, así que no agrega nada, y exigiría
que el frontend fije `data-action`, un cambio de contrato.

**Antes que todo lo demás.** `AuthService#registrar` verifica el captcha antes
de la versión de los términos y del correo duplicado. Si lo hiciera después,
el 409 «El correo ya está registrado» respondería sin captcha y el endpoint
serviría para averiguar qué correos tienen cuenta (`RegistroCaptchaIT` lo
comprueba con un correo existente y un token rechazado).

**Fuera de la transacción.** La llamada a Cloudflare puede tardar segundos;
dentro de una transacción retendría una conexión del pool mientras tanto
(D-13, ARCHITECTURE.md §4.5). Por eso `registrar` dejó de ser
`@Transactional`: verifica el captcha y recién entonces llama a
`RegistroCuentaService#crearCuentaCiudadana`, otro bean de `auth/service`
cuyo método `@Transactional` pasa por el proxy de Spring (una llamada interna
a un método del mismo bean no abriría la transacción). Con
`spring.jpa.open-in-view: false` (application.yml) tampoco hay una sesión de
Hibernate abierta por la petición que retenga la conexión.

**Sin `remoteip`.** Cloudflare lo acepta como opcional; enviarlo cedería al
proveedor la IP de cada ciudadano que se registra, un dato personal que no
hace falta para verificar (principio de proporcionalidad o minimización, Ley
N.° 29733). El pedido lleva solo `secret` y `response`. En el log solo quedan
los `error-codes` que tienen forma de código (`timeout-or-duplicate`) y el
`hostname` si tiene forma de hostname; nunca el token ni el secreto. Un 400 de
Cloudflare también deja sus códigos: `invalid-input-secret` dice que revisar.

**Por qué `ninguno` por defecto fuera de `prod`.** Los IT y el desarrollo local
corren sin red y sin claves; con `turnstile` por defecto cada registro de la
suite llamaría a Cloudflare. En `prod`, `CAPTCHA_TIPO` no tiene valor por
defecto (no arranca sin ella, `ArranqueCaptchaIT`), así que desactivar el
captcha en producción exige escribir `ninguno` a propósito. Para probar el
flujo real en local, Cloudflare publica claves de prueba (una que siempre
aprueba, una que siempre rechaza y una que responde «token ya usado»,
anotadas en `.env.example`); nunca van a producción, y si llegaran, la lista
de hostnames lo detecta.

**Pruebas.** `TurnstileAdapterTest` (`MockRestServiceServer`, con las
respuestas reales del `siteverify`: formulario sin `remoteip`, aprobación,
rechazo con varios `error-codes`, los códigos que son del servidor, 4xx/5xx,
el 400 de una clave inválida, cuerpos mal formados, timeout real contra un
socket local, conexión rechazada, el hostname contra la lista y que el log
no lleve el token ni el secreto); `RegistroTurnstileIT` (el adaptador real,
elegido por la configuración y con la lista de hostnames de `prod`, contra un
`siteverify` local: 201, 409 rechazado, 409 por hostname, 503 y 409 sin
token); `RegistroCaptchaIT` (con un `VerificadorDeCaptcha` simulado que exige
el captcha: sin token, rechazado, proveedor caído, correo existente y token
válido); `ValidacionTipoCaptchaTest` y `ArranqueCaptchaIT` (valores no
admitidos, `recaptcha` incluido, y `prod` sin la variable); `PerfilProdIT`
(la lista de hostnames por defecto en `prod`).

**Prueba en vivo (28/10).** Con la app en `:8081` y `CAPTCHA_TIPO=turnstile`
contra el `siteverify` real: la clave de prueba que aprueba y el token
`XXXX.DUMMY.TOKEN.XXXX` dan **201** (y un WARN «clave secreta de prueba»);
sin token, **409** «Confirma que no eres un robot»; la clave que siempre
rechaza, **409** (`invalid-input-response`), también con un correo que ya
tiene cuenta; la clave que aprueba con
`CAPTCHA_HOSTNAMES=ciudadviva.app,www.ciudadviva.app`, **409** (hostname
`example.com`, «la clave secreta es una de prueba de Cloudflare»); una clave
secreta inventada, **503** (HTTP 400, `invalid-input-secret`). Ni el token ni
el secreto aparecen en el log.

## Confirmación del correo (NC-09)

Desde NC-09 el correo de una cuenta tiene que ser verídico. Tres decisiones
del usuario (28/10):

1. **Una cuenta sin confirmar no puede iniciar sesión** hasta abrir el
   enlace que recibe por correo.
2. **Las cuentas que ya existían se dan por confirmadas** (la migración V20):
   en producción ya hay usuarios reales y ninguno debe quedar fuera.
3. **El registro rechaza el correo** si su dominio no recibe correo (sin
   registro MX en el DNS) o si es un dominio desechable conocido (temp-mail,
   10minutemail, mailinator…), según una lista fija versionada.

### El flujo

| Paso | Endpoint | Respuesta |
|---|---|---|
| Registro | `POST /api/auth/registro` | 201 `{"email", "vigenciaEnlaceHoras": 24}`. **Ya no inicia sesión ni devuelve token** (antes: `AuthResponse`). La cuenta queda con `correo_confirmado = false` y se envía el enlace. |
| Enlace | `<PWA>/confirmar-cuenta?token=<43 caracteres>` | La PWA lee el token y llama al endpoint de abajo. |
| Confirmar | `POST /api/auth/confirmar-correo` `{"token"}` | 204. No inicia sesión, como `restablecer-password`: la persona entra después con su contraseña. |
| Login sin confirmar | `POST /api/auth/login` | 409 con `codigo: CORREO_NO_CONFIRMADO`, **solo con la contraseña correcta**. Con una incorrecta sigue el 401 de siempre. |
| Reenviar | `POST /api/auth/reenviar-confirmacion` `{"email"}` | 202 sin cuerpo, siempre. |

Errores de `confirmar-correo`, todos 409 con un `codigo` estable para la
PWA (`BusinessException` suma un código opcional, que
`GlobalExceptionHandler` copia a `ApiError.codigo` como el
`TERMINOS_PENDIENTES` de D-12):

| `codigo` | Cuándo |
|---|---|
| `CONFIRMACION_INVALIDA` | Token desconocido. |
| `CORREO_YA_CONFIRMADO` | La cuenta ya está confirmada (incluye volver a abrir un enlace usado). |
| `CONFIRMACION_REEMPLAZADA` | Se pidió un enlace nuevo después de este. |
| `CONFIRMACION_VENCIDA` | Pasaron 24 horas. |

Un enlace usado implica una cuenta confirmada, así que «usado» responde
`CORREO_YA_CONFIRMADO` («Tu correo ya está confirmado. Inicia sesión…»): es
lo que le sirve a quien vuelve a abrir el enlace, o a quien se le adelantó el
antivirus del correo abriéndolo primero.

### El token: aleatorio, de un solo uso y guardado como hash

Sigue el patrón de la recuperación de contraseña (`PasswordResetService`,
DEP-08): tabla propia (`token_confirmacion_correo`, V20), un solo uso,
vencimiento (24 h) y el correo después del commit, fuera de la petición y de
la transacción (`ConfirmacionCorreoSolicitadaListener`, D-13). Dos
diferencias:

- **Se guarda el SHA-256 del token, nunca el token** (`token_hash`). Quien
  lea la base o un respaldo no puede confirmar cuentas ajenas. Sin sal: el
  token ya tiene 256 bits de azar (`SecureRandom`, 43 caracteres base64url),
  así que no hay diccionario contra el que probar, y la búsqueda por igualdad
  necesita un hash determinista.
- **El token lo genera el hilo que envía el correo.** Con el token hasheado,
  el listener no podría reconstruirlo a partir del id del evento (como hace
  la recuperación). El registro y el reenvío guardan una fila sin hash y
  publican `ConfirmacionCorreoSolicitadaEvent(tokenId)`; en el executor
  asíncrono, `ConfirmacionCorreoService#emitirMensaje` genera el token,
  guarda su hash en una transacción corta y arma el mensaje, que se envía
  sin transacción. El valor no pasa por la petición, por el evento ni por la
  base: solo existe en ese hilo y en el correo.

**Pedir uno nuevo anula los anteriores** (`invalidated_at`), y confirmar
anula los demás pendientes. Si mientras un envío esperaba en la cola la
persona pidió otro, ya confirmó o el enlace venció, `emitirMensaje` devuelve
vacío y no se envía nada. El hash se escribe con un `UPDATE` condicional
(`TokenConfirmacionCorreoRepository#emitir`: solo si la fila sigue sin hash,
sin usar, sin anular y vigente), no guardando la entidad leída: si un reenvío
anula la fila entre la lectura y la escritura, PostgreSQL vuelve a evaluar la
condición tras esperar el candado de la fila y no la emite. Guardar la
entidad reescribiría `invalidated_at` con el valor leído y dejaría dos
enlaces válidos (hallazgo de la revisión del 28/10). Por lo mismo la entidad
lleva `@DynamicUpdate`: confirmar solo escribe `used_at`.

**Topes del reenvío, por cuenta:** uno por minuto (el del registro cuenta),
5 por hora y 10 por día. El endpoint responde igual exista o no la cuenta,
esté o no confirmada y se alcance o no un tope: no sirve para averiguar qué
correos tienen cuenta. Con solo el minuto, un bucle sobre una cuenta pediría
1440 enlaces al día; con solo el tope por hora, 120, que igual superan la
cuota diaria de Resend Free (100) y dejarían sin correo a todos. Con el tope
diario una cuenta gasta a lo sumo 10, y agotar la cuota exige muchas
cuentas, cada una con su captcha. (La recuperación de contraseña, 3 por hora
y sin tope diario, sigue como en DEP-08.) Los pedidos simultáneos de una
cuenta se serializan con un candado consultivo (`pg_advisory_xact_lock`
sobre `confirmacion-correo:<id>`), como la recuperación. La PWA debe
deshabilitar el botón «reenviar» un minuto: la respuesta no dice si se
envió.

**El enlace apunta a la PWA** con la URL de `FRONTEND_URL` o, sin ella, el
primer origen de `CORS_ALLOWED_ORIGINS`, que en todos los entornos es el de
la PWA y en `prod` ya es obligatorio: así no se suma una variable
obligatoria. La recuperación de contraseña no arma enlaces (el correo trae un
token para pegar), así que no había una propiedad que reutilizar. Una URL que
no sea un origen `http(s)://host[:puerto]` sin ruta no arranca.

**El token va en la query (`?token=`)**, como pidió la tarea, y por eso
llega al servidor de la PWA y puede quedar en sus registros de acceso
(Vercel). Se acepta porque el token es de un solo uso, vence en 24 horas y
deja de servir al confirmar. La alternativa, un fragmento
(`/confirmar-cuenta#token=…`), que el navegador no envía, queda anotada como
endurecimiento posible: cambia el contrato con la PWA.

### El correo tiene que ser verídico: dominio desechable o sin MX

En `AuthService#registrar`, el orden es: captcha (NC-08) → **dominio del
correo** → términos y correo duplicado → crear la cuenta. El dominio va
antes de crear nada y, como el captcha, **sin transacción**: la consulta DNS
no retiene una conexión del pool (D-13). No revela nada de las cuentas, así
que puede ir antes del 409 «El correo ya está registrado».

| Rechazo (409) | `codigo` | Mensaje |
|---|---|---|
| Dominio desechable, o subdominio de uno | `CORREO_DESECHABLE` | «No aceptamos correos temporales o desechables. Usa una dirección que revises seguido: ahí te avisaremos cómo avanzan tus reportes.» |
| El dominio no recibe correo | `DOMINIO_SIN_CORREO` | «El dominio «gmail.con» no puede recibir correos. Revisa que esté bien escrito o usa otra dirección.» (nombra el dominio: casi siempre es un error de tipeo) |

**Desechables: lista fija y versionada.** `resources/data/dominios-desechables.txt`
es una instantánea de la lista
[`disposable-email-domains`](https://github.com/disposable-email-domains/disposable-email-domains)
(`disposable_email_blocklist.conf`, commit `fa96007`, del 27/10/2026,
descargada el 28/10/2026, **9963 dominios**), con licencia **CC0 1.0**
(dominio público). Fuente, commit, fecha y licencia van también en la
cabecera del archivo. No se actualiza sola: actualizarla es reemplazar el
archivo y la cabecera, y correr `DominiosDesechablesTest`. La regla
(`auth/domain/DominiosDesechables`, pura) cubre los subdominios
(`x.mailinator.com`), compara en minúsculas y en ASCII (IDN) y nunca un
dominio de primer nivel solo. La lee `auth/infra/ArchivoDominiosDesechables`
al arrancar (sin el archivo no arranca). No necesita red, así que se aplica
en todos los perfiles, también en los tests. La lista incluye dominios de
tipeo de los proveedores grandes (`gmial.com`, `hotmial.com`), que se usan
para recibir correo ajeno.

**MX: un puerto con dos adaptadores**, elegidos con `app.dominio-correo.tipo`
(`DOMINIO_CORREO_TIPO`), como el captcha:

| Valor | Adaptador | Uso |
|---|---|---|
| `dns` | `auth/infra/DnsVerificadorDeDominioAdapter` | Por defecto en `prod`: `application-prod.yml` dice `${DOMINIO_CORREO_TIPO:dns}`, así que no hace falta definir la variable; solo sirve para apagarlo. |
| `ninguno` | `auth/infra/SinVerificacionDeDominioAdapter` | Por defecto fuera de `prod` (en local se registran cuentas `@viasegura.test`, sin MX) y fijo en los tests, sin red. |

El adaptador DNS usa el proveedor DNS de JNDI que trae el JDK (sin
dependencias nuevas; el módulo `jdk.naming.dns` viene en la imagen
`eclipse-temurin:21-jre`) con los servidores del sistema. **Rechaza** un
dominio que no existe (NXDOMAIN), uno sin MX y uno con «null MX» (RFC 7505,
un único `0 .` que declara que no recibe correo); también, sin consultar, un
literal de IP o un nombre sin punto. No aplica el «MX implícito» del
RFC 5321 (entregar al registro A cuando no hay MX): la decisión fue «sin
registro MX, no recibe correo», y un dominio que recibe correo de verdad
publica su MX.

**Falla abierto, con un plazo garantizado.** Si el DNS falla (SERVFAIL, sin
servidores) o no responde, se acepta el registro y queda un WARN con el
dominio (nunca el correo): el enlace es la prueba definitiva y un DNS caído
no debe impedir registrarse. JNDI espera 1 s y reintenta una vez con 2 s,
pero **por servidor**; por eso la consulta corre en un hilo virtual y la
petición espera como máximo `app.dominio-correo.dns.plazo-milisegundos`
(3000).

**Verificación contra el DNS real (2026-10-28, Windows)**, con la misma
consulta JNDI: `gmail.com` → 5 MX (128 ms); `upc.edu.pe` →
`0 upc-edu-pe.mail.protection.outlook.com.` (preferencia 0 con servidor: se
acepta); `example.com` → `0 .` (null MX: se rechaza); un dominio inexistente
→ NXDOMAIN (`NameNotFoundException`, 16 ms); `lima.pe` → NXDOMAIN. Este
último es el dominio de los correos de los IT: por eso los tests fijan
`ninguno`, y `PerfilProdIT` (que corre con `dns`) simula el puerto.

### Quién nace confirmado

- El **ADMIN inicial** (`AdministradorInicialSeeder`): su correo lo da el
  operador del despliegue.
- Las cuentas de `scripts/seed-datos-prueba.sql` (desarrollo): el script las
  marca confirmadas.
- En los IT, los usuarios de fixture (`AbstractPostgisIT#guardarConTerminos`).
  Los IT que registran por el API confirman con
  `AbstractPostgisIT#confirmarEIniciarSesion` (un `UPDATE` directo, porque el
  token solo está en el correo) y entran por `POST /api/auth/login`: la
  regla no se debilita. El flujo real del enlace lo prueba
  `ConfirmacionCorreoIT`.
- Un funcionario (DEP-05) se registra como cualquier ciudadano, así que
  confirma su correo antes de que se le asigne el rol. Desde NC-09b,
  `asignar-funcionario.sql` lo exige (ver abajo).

`Usuario.correoConfirmado` es `false` por defecto, también en el builder:
una cuenta nueva nace sin confirmar salvo que quien la crea diga lo
contrario.

### Cuentas sin confirmar (NC-09b)

NC-09 dejó tres casos borde en la propuesta
`project-context/decisions/propuestas/2026-10-28-cuentas-sin-confirmar.md`.
El usuario los decidió el 28/10:

1. **Una cuenta sin confirmar no recupera la contraseña, y restablecerla no
   confirma el correo.** En palabras del usuario: «No pueden restablecer la
   contraseña de una cuenta no creada, de todas maneras tendrán que pasar por
   la confirmación del correo». El único camino a una cuenta confirmada es el
   enlace de confirmación.
   - `POST /api/auth/recuperar-password` con el correo de una cuenta sin
     confirmar hace **lo mismo que con un correo sin cuenta**: 202 sin
     cuerpo, sin token y sin correo. `PasswordResetService` corta en el
     mismo punto que con la cuenta inexistente, después de la misma
     consulta y antes del candado y del conteo del tope, así que tampoco el
     tiempo de respuesta lo distingue. Deja un `INFO` con el id de la
     cuenta, nunca el correo.
   - Un token de recuperación de una cuenta sin confirmar (solo pudo quedar
     de antes de esta regla) **vale lo mismo que uno inexistente**:
     `restablecer-password` responde el 404 «Token de recuperación
     inválido», antes de mirar si se usó o venció, y no cambia nada. Si
     estaba en la cola asíncrona, `mensajeDeRecuperacion` no lo envía. Se
     eligió el 404 de siempre y no un 409 con código nuevo: el contrato no
     cambia y la PWA no necesita otro caso para una situación que, con la
     regla, ya no se produce.
2. **Las cuentas que nunca se confirman se purgan a los 30 días**, en su
   propia tarea: **BE-15**, ver «Purga de cuentas sin confirmar (BE-15)»
   más abajo.
3. **`asignar-funcionario.sql` exige la cuenta confirmada**: con una cuenta
   sin confirmar falla con un mensaje claro y no asigna nada (ver «Alta y
   baja de funcionarios»).

**La dueña de un correo que otro registró** ve «El correo ya está
registrado», y «¿Olvidaste tu contraseña?» no le envía nada. Recupera la
cuenta con el correo de confirmación que le llegó cuando el otro se
registró: abre el enlace, que confirma la cuenta (con la contraseña que
puso el otro, que no conoce), y después cambia la contraseña con
«¿Olvidaste tu contraseña?», que ya funciona. Si el enlace venció, la página
a la que lleva (`/confirmar-cuenta`) le deja pedir otro escribiendo su
correo. El enlace de confirmación sigue siendo la única prueba de que el
correo es suyo, como decidió el usuario.

**Si ya no tiene ese correo (NC-09c).** La revisión del 28/10 encontró un
hueco: la PWA no mostraba dónde pedir el enlace sin la contraseña. El
«Reenviar el enlace» del inicio de sesión solo aparece con el 409
`CORREO_NO_CONFIRMADO`, que exige la contraseña correcta, y antes de NC-09b
la sacaba de ahí «¿Olvidaste tu contraseña?». El usuario decidió el 28/10 la
opción C de
`project-context/decisions/propuestas/2026-10-28-reenviar-confirmacion-sin-contrasena.md`.
Tras pedir el token, «¿Olvidaste tu contraseña?» dice siempre que a una
cuenta sin confirmar no le llegará el correo y ofrece «Reenviar el enlace»
de confirmación al correo escrito. Usa `POST /api/auth/reenviar-confirmacion`,
que solo pide el correo y responde 202 siempre, así que no revela nada. Está
implementado en NC-09c, solo en el frontend: el backend no cambia.

Riesgo que queda: entre la
confirmación y el cambio de contraseña, quien registró la cuenta puede
entrar con su contraseña, y su JWT sigue valiendo hasta que vence (120
minutos como máximo: no hay blacklist de tokens, ver «Decisiones de
seguridad»). Es una ventana corta y la cuenta recién confirmada todavía no
tiene datos de la dueña.

### Purga de cuentas sin confirmar (BE-15)

Decisión del usuario del 28/10 (pregunta 2 de la propuesta de NC-09b): una
cuenta que nunca confirmó su correo se **borra a los 30 días de creada**.
Sin la purga quedaba para siempre en `usuario`, con nombre, apellido, correo y
la aceptación de los términos, sin finalidad (Ley N.° 29733,
proporcionalidad), y ocupaba el correo («El correo ya está registrado»).
Desde NC-09b tampoco podía recuperar la contraseña.

**Qué borra.** `auth/service/PurgaCuentasSinConfirmarService`, una vez al
día, borra las cuentas con `correo_confirmado = false`:

- solo `CIUDADANO`: nunca el ADMIN ni un funcionario, aunque estén sin
  confirmar (desde NC-09b `asignar-funcionario.sql` no asigna una cuenta sin
  confirmar);
- creadas hace más de `CUENTAS_SIN_CONFIRMAR_PLAZO` (30 días por defecto;
  menos de 1 día no arranca, porque un `0` borraría cada cuenta recién
  creada);
- sin un **enlace de confirmación vigente** (sin usar, sin anular y sin
  vencer, contando el que todavía espera su correo): quien pidió «Reenviar»
  el día 30 puede usarlo, y la cuenta se borra en la primera corrida después
  de que venza.

**En qué orden.** Con la cuenta se borran, primero, sus filas de
`token_confirmacion_correo`, `password_reset_token` (desde NC-09b no recibe
ninguno, pero puede quedar alguno de antes) y `consentimiento`, y al final
la fila de `usuario`. No se anonimiza nada: una cuenta sin confirmar no tiene
contenido que conservar. **Los consentimientos se borran con la cuenta, y eso
lo tiene que ratificar el usuario**: la ficha de BE-15 lo dejó abierto (D-12,
la misma duda que BE-14 para el cierre de cuenta) y está en
`project-context/decisions/propuestas/2026-10-30-consentimientos-de-cuentas-purgadas.md`,
con las opciones. Se implementó la recomendada, que es la que ya anuncian los
términos v2 (§8: «borramos la cuenta y sus datos»): la aceptación de un correo
que nadie verificó no prueba el consentimiento de nadie, y sin cuenta no queda
ningún tratamiento que justificar.

**Lo que no debería existir.** Una cuenta sin confirmar no pudo iniciar
sesión, así que no tiene reportes, adhesiones, comentarios, calificaciones,
suscripciones push, claves de idempotencia, tickets, notificaciones,
denuncias ni foto de perfil. Si aparece alguna de esas filas, **la cuenta no
se borra** y queda un `WARN` con su id y el nombre de la clave foránea que lo
impidió (por ejemplo `suscripcion_push_usuario_id_fkey`), o «tiene foto de
perfil». La lista de tablas no está en el código: el `DELETE` de `usuario`
falla por la clave foránea, la transacción de esa cuenta se revierte entera
(también los consentimientos y los enlaces ya borrados) y se sigue con la
siguiente. Así, una tabla nueva que referencie a `usuario` queda cubierta
sin tocar la purga. La foto de perfil es una columna, no una clave foránea,
y se mira aparte.

**Carreras.** Cada cuenta va en su propia transacción corta
(`TransactionOperations`, como `ReporteService#crear`), con dos candados:

1. el candado consultivo de los reenvíos de esa cuenta, el mismo que toma
   `ConfirmacionCorreoService#reenviar`. Un reenvío en curso termina antes, y
   la purga ve su enlace nuevo y no borra; o empieza después, y `reenviar`
   comprueba tras el candado que la cuenta sigue existiendo (si no, no hace
   nada, sin error);
2. el candado de la fila de `usuario` (`FOR UPDATE`), solo si sigue sin
   confirmar. Si una confirmación la está escribiendo, la purga espera y
   PostgreSQL vuelve a evaluar la condición: **gana la confirmación** y la
   cuenta no se toca. La confirmación, a su vez, toma el candado de la fila
   (`FOR NO KEY UPDATE`, que no choca con quien inserta filas que la
   referencian) antes de escribir: si **gana el borrado**, el enlace deja de
   existir y la PWA muestra `CONFIRMACION_INVALIDA`, lo mismo que si la purga
   hubiera terminado antes de abrirlo.

Con los candados tomados, la purga vuelve a mirar el enlace vigente y la
foto, y el `DELETE` final vuelve a exigir `correo_confirmado = false` (y el
rol y el plazo) **en la misma sentencia**. Una segunda corrida no encuentra
nada (idempotente), y dos instancias a la vez no se pisan.

**Registro.** Un `INFO` por corrida con cuántas cuentas borró (y cuántas
conservó con datos asociados, si hubo); los `WARN` llevan ids, nunca un
correo ni un nombre, y el de un fallo, solo la clase de la excepción (su
mensaje puede traer valores de la base). **Sin aviso por correo** antes de
borrar: la decisión no lo pide y gastaría cuota de Resend; si se quiere, va
con `/propuesta`.

### Tareas programadas (BE-15)

La purga es la primera tarea programada del backend, así que fija el patrón
(la ficha lo pedía si entraba antes que BE-13, el borrado de las consultas de
soporte):

- `common/config/TareasProgramadasConfig` activa `@EnableScheduling`. Usa el
  `ThreadPoolTaskScheduler` de Spring Boot (un hilo), aparte de los executors
  de `AsyncConfig`: una tarea larga no quita hilos a los correos ni a los
  avisos.
- El `@Scheduled` va en un método del **servicio** del módulo dueño de los
  datos (`auth` aquí, `soporte` en BE-13), con la expresión cron en una
  propiedad (`app.<tema>.purga.cron`) y `zone = "America/Lima"`. Una tarea
  programada es un caso de uso sin HTTP, de la capa de aplicación. No va en
  `infra/`, porque `infra` no puede llamar a un `service` (ArchUnit), ni en
  `listener/`, que es para eventos de dominio. Tampoco en un controlador.
- El método programado **no es `@Transactional`**: abre transacciones cortas
  por dato, para que uno que falla no revierta los demás, y se niega a correr
  dentro de otra transacción. Atrapa cualquier fallo y lo registra (sin el
  mensaje), para que el planificador siga con la próxima corrida.
- **Sin candado distribuido (ShedLock):** el backend corre en una sola
  instancia en Railway, y la purga es idempotente y segura con dos a la vez
  (candados de fila y `DELETE` condicional). Si algún día hay réplicas y una
  tarea no lo es, se agrega.
- **En los tests está apagada** (`cron: "-"` en `application-test.yml`): una
  corrida a mitad de la suite haría que los IT dependan de la hora. Los IT
  llaman al método del servicio directamente.

### Lo que no cubre

- El 409 `CORREO_NO_CONFIRMADO` del login solo aparece con la contraseña
  correcta, así que no revela nada que no sepa quien ya la tiene.
- La purga de las cuentas sin confirmar (BE-15) corre una vez al día: una
  cuenta vencida puede durar hasta un día más que el plazo, y una con un
  enlace pedido el último día, hasta que ese enlace venza (24 h).

### Pruebas

- `ConfirmacionCorreoIT` (GreenMail, el token se lee del correo):
  registro sin sesión; el correo con el enlace y, en la base, solo el hash;
  login sin confirmar 409 con código y con contraseña incorrecta el 401 de
  siempre; confirmar y entrar; confirmar dos veces; enlace vencido,
  desconocido y reemplazado; reenvío que no enumera (cuenta inexistente,
  confirmada y sin confirmar: misma respuesta, un solo correo), uno por
  minuto, topes por hora y por día, seis reenvíos simultáneos que crean un
  solo enlace, y que una fila anulada o ya emitida no se emite.
- `PasswordResetIT` (NC-09b): pedir la recuperación de una cuenta sin
  confirmar responde igual que con un correo sin cuenta (estado, cuerpo y
  cabeceras), sin token ni correo en GreenMail, y deja el `INFO` sin el
  correo; un token de esa cuenta, vigente o vencido, da el mismo 404 que uno
  inexistente y no cambia la contraseña ni confirma el correo; el listener no
  lo envía; y, ya confirmada, la cuenta sí recupera.
- `AsignarFuncionarioScriptIT` (NC-09b): el bloque `DO` de
  `asignar-funcionario.sql`, leído del archivo, falla con una cuenta sin
  confirmar (mensaje y pista exactos) sin asignar nada, y asigna una
  confirmada.
- `PurgaCuentasSinConfirmarIT` (BE-15, cuentas registradas por el API y
  llevadas al pasado con `JdbcTemplate`): borra la cuenta sin confirmar de
  hace 31 días con sus enlaces, tokens de recuperación y consentimientos, y
  no toca una sin confirmar de hace 29, una confirmada de hace 31 ni una sin
  confirmar de hace 31 con un enlace pedido hace una hora; nunca el ADMIN ni
  un funcionario; el correo borrado se vuelve a registrar; una segunda
  corrida no borra nada y el `INFO` no lleva correos; una suscripción push o
  una foto de perfil la conservan con un `WARN` con su id, sin dejarla a
  medias; las dos carreras con la confirmación (gana la confirmación si llega
  antes al candado; si gana el borrado, el enlace da 409
  `CONFIRMACION_INVALIDA`); un reenvío después de la purga no falla; y se
  niega a correr dentro de otra transacción.
- `PurgaCuentasSinConfirmarServiceTest` (sin base): el plazo mínimo, la
  anotación `@Scheduled` (propiedad y zona de Lima), que la tarea programada
  no propaga un fallo, cada desenlace por cuenta (confirmada o con enlace
  nuevo mientras tanto, foto, clave foránea con su nombre, un fallo que no
  detiene a las demás, el `DELETE` que no borra y revierte) y que ningún
  registro lleva el mensaje de la excepción.
- `RegistroDominioCorreoIT` (el puerto del DNS simulado): sin MX → 409 sin
  crear la cuenta; desechable (y subdominio con mayúsculas) → 409 sin
  consultar el DNS; DNS caído → registra; el dominio va antes del correo
  duplicado. `RegistroCaptchaIT` suma que el captcha va antes del dominio.
- Unitarios: `DnsVerificadorDeDominioAdapterTest` (resolvedor inyectado:
  MX, sin MX, null MX, NXDOMAIN, SERVFAIL, un DNS colgado que vuelve dentro
  del plazo), `DominiosDesechablesTest` (la regla y la instantánea:
  9963 dominios, cabecera con fuente y licencia, conocidos dentro y
  proveedores comunes fuera), `ValidacionTipoDominioCorreoTest`,
  `ConfirmacionCorreoSolicitadaListenerTest` y `ConfirmacionCorreoServiceTest`
  (URL de la PWA, hash y ciclo del token).

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
`UsuarioResponse` (de `/me` y del login; desde NC-09 el registro ya no la devuelve) suma `debeAceptarTerminos`. Es
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
se envían siempre: salen por el puerto `CorreoSaliente` directo y no pasan
por `NotificacionService`. Si el usuario no autoriza ningún canal, cada intento se
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

## Sugerencia de categoría por la foto (NC-04, fase 0)

**Qué agrega.** Al reportar, la PWA puede enviar la foto a
`POST /api/clasificaciones` y recibir la categoría que el modelo sugiere
(«Bache», «Pista deteriorada») para proponerla al ciudadano. Después de crear
el reporte, el backend vuelve a clasificar la foto **guardada** y registra la
sugerencia oficial en `reporte` (`categoria_sugerida_id`,
`confianza_sugerencia`, `version_modelo_sugerencia`). Esa es la que mide la
evaluación del modelo (OE3: sugerida frente a confirmada). Sigue la propuesta
aceptada el 21/10 (`project-context/decisions/propuestas/2026-10-21-ml-clases-modelo.md`),
fase 0: todo el flujo con un **clasificador falso**, antes de que existieran
el servicio `inferencia/` (NC-03) y su adaptador HTTP. Desde NC-04b (v0.8.0)
producción sugiere con el modelo real: ver
[El adaptador del servicio de inferencia](#el-adaptador-del-servicio-de-inferencia-nc-04b).

| Pieza | Capa | Qué hace |
|---|---|---|
| `clasificacion/port/ClasificadorDano` | Puerto | Detecta daños en una foto ya saneada y devuelve `ResultadoDeteccion(versionModelo, detecciones)`. Sus errores salen como `ClasificacionNoDisponibleException`. |
| `clasificacion/infra/InferenciaHttpAdapter` | Adaptador | `POST /v1/detecciones` del servicio `inferencia/` (NC-04b, `CLASIFICACION_TIPO=http`). |
| `clasificacion/infra/FalsoClasificadorAdapter` | Adaptador | Respuesta fija por configuración (`CLASIFICACION_FALSO_RESPUESTA`): vacía, pares `clase:confianza` o `falla`. |
| `clasificacion/domain/PoliticaDeSugerencia` | Dominio | Umbral y clase dominante (abajo). Regla pura, con `PoliticaDeSugerenciaTest`. |
| `clasificacion/service/ClasificacionService` | Aplicación | Vista previa (sanea, detecta y aplica la política) y sugerencia sobre una foto ya saneada. Sin transacción. |
| `clasificacion/controller/ClasificacionController` | Presentación | `POST /api/clasificaciones`. |
| `clasificacion/port/CategoriasClasificables` ← `reportes/infra/JpaCategoriasClasificablesAdapter` | Puerto y adaptador | Las categorías activas con clase del modelo. |
| `reportes/listener/SugerenciaCategoriaListener` → `reportes/service/SugerenciaCategoriaService` → `ReporteService#registrarSugerencia` | Aplicación | Sugerencia oficial después del commit (D-08). |
| V19 | Esquema | Columnas nuevas con sus `CHECK`, clases del modelo y baja de «Hueco en calzada». |

### Política de sugerencia

1. Se descartan las detecciones cuya clase no corresponde a ninguna categoría
   **activa** con `clase_modelo`, y las de confianza fuera de [0, 1].
2. El puntaje de cada categoría es la **máxima** confianza de sus detecciones
   (no la suma: tres grietas de 0,4 no hacen una de 1,2).
3. Se sugiere la de mayor puntaje si es **≥ umbral** (`CLASIFICACION_UMBRAL`,
   0,50). Un empate exacto en el primer lugar o ningún puntaje sobre el umbral
   dan «sin sugerencia».
4. La confianza es ese puntaje con 3 decimales (`NUMERIC(4,3)`). El umbral se
   compara con el valor **sin redondear**: 0,4996 no se sugiere aunque se
   guardaría como 0,500.

**Por qué 0,50 y no el 0,25 habitual** de los detectores: aquí una sugerencia
equivocada empuja al ciudadano a la categoría errónea (anclaje), y equivocarse
cuesta más que no sugerir. El umbral se calibra en NC-03b con fotos de Lima.
La agregación por máximo es una elección razonable sin respaldo específico en
la literatura; las alternativas (suma, área de la caja) se comparan con ese
mismo conjunto de fotos.

Las clases del contrato son las de la propuesta (opción A): `bache` (D40 de
RDD2022) para «Bache» y `grieta` (D00, D10 y D20) para «Pista deteriorada».
Se comparan tal cual, en minúsculas. Una categoría sin `clase_modelo` (las
demás estándar y todas las de un distrito) **nunca** se sugiere: el ciudadano
la elige a mano, como siempre.

### Vista previa: `POST /api/clasificaciones`

| | |
|---|---|
| Quién | Solo `CIUDADANO` con los términos vigentes (401 sin token, 403 con otro rol): es el único que crea reportes. |
| Entrada | `multipart/form-data` con la parte `foto` (JPEG, PNG o WEBP, hasta 10 MB). |
| Respuesta | **200** `{"categoriaId": 1, "categoriaNombre": "Bache", "fotoRechazada": false}`, o `{"categoriaId": null, "categoriaNombre": null, "fotoRechazada": false}` sin sugerencia. Desde NC-10b, `fotoRechazada: true` (y sin categoría) si la moderación rechazaría la foto: ver [Moderación de contenido](#moderación-de-contenido-nc-10b-d-15). |
| Errores | Sin la parte `foto`, o vacía: 400. No es una imagen válida: 409, el mismo de la creación (solo con la clasificación o la moderación encendidas: con las dos apagadas no se sanea y la respuesta es 200 «sin sugerencia»). **Nunca 503**: sin turno, o con la moderación caída, 200 «sin sugerencia» y `fotoRechazada: false`. |
| Persistencia | **Ninguna**: ni la foto ni el resultado (`ClasificacionVistaPreviaIT` cuenta reportes y archivos antes y después). |

- **La foto pasa por el mismo `SaneadorDeImagen` que el almacenamiento**
  antes de clasificarse (ajuste a D-08 de la propuesta de fotos del 21/10):
  el modelo ve la imagen que verá la sugerencia oficial (orientada, a 2048 px,
  recomprimida). Como el saneado y el modelo son deterministas, la misma foto
  da la misma sugerencia en los dos momentos. La sugerencia oficial **no**
  vuelve a sanear la foto guardada: recomprimirla daría otros píxeles.
- **Solo la categoría, sin confianza ni versión.** La sugerencia es una señal
  interna, y la vista previa muestra lo mínimo que necesita la interfaz.
  Exponer el puntaje daría a cualquier ciudadano un instrumento para sondear
  el detector foto a foto, y no ayuda a elegir (por debajo del umbral ya no se
  sugiere nada). Agregar un campo después es compatible; quitarlo, no.
- **Un error del clasificador nunca llega al ciudadano**: ni el servicio
  caído (`ClasificacionNoDisponibleException`) ni cualquier otra excepción del
  adaptador (un bug, una respuesta fuera del contrato). La respuesta es «sin
  sugerencia», con un WARN en el log, y el ciudadano elige a mano. La PWA no
  distingue esos casos del de una foto sin un daño claro.
- **La vista previa no compite con las subidas por el saneado** (la IA nunca
  bloquea un reporte, §4.3). El saneado admite 2 fotos a la vez en todo el
  servidor, y cada turno que ocupa una vista previa lo puede estar esperando
  un ciudadano que envía su reporte (desde BE-11 esa espera ya no retiene una
  conexión, pero sigue demorando la creación). Por eso la vista previa tiene un **turno
  propio que no espera** (`ClasificacionService`, uno a la vez): si está
  ocupado, la respuesta es «sin sugerencia» al instante. Así las vistas
  previas nunca ocupan más de uno de los dos turnos y siempre queda otro para
  las creaciones. Si las creaciones ocupan los dos, la vista previa que tiene
  su turno espera el del saneado como cualquier subida (hasta 10 s) y, sin él,
  responde «sin sugerencia», nunca 503.
- **Con la clasificación apagada no se sanea nada** (salvo que la moderación
  esté encendida: desde NC-10b la vista previa también avisa si la foto se
  rechazaría, y para eso la sanea). `ClasificadorDano`
  declara si puede detectar algo (`estaDisponible()`); el falso sin respuesta,
  que es como corre producción con `CLASIFICACION_TIPO=falso`, dice que no.
  Entonces la vista previa responde «sin sugerencia» sin sanear la foto (por eso ahí una foto
  inválida no da 409) y la sugerencia oficial no lee la base ni descarga la
  foto. Lo decide el adaptador y no una propiedad `habilitada` aparte, para
  que no puedan contradecirse (una «habilitada» con un falso que no detecta
  nada). El adaptador HTTP (NC-04b) responde `true`: un servicio caído se
  nota al llamarlo, no antes.

### Sugerencia oficial (D-08)

1. `ReporteService` publica `ReporteCreadoEvent` (que ahora lleva `conFoto`)
   solo al crear un reporte nuevo. Una **adhesión** (US-09) no crea un reporte
   ni lo vuelve a clasificar, y su foto no se guarda.
2. `SugerenciaCategoriaListener` (`AFTER_COMMIT`) solo encola, y solo si hay
   foto. Con la cola del executor llena registra un WARN con el reporte y la
   descarta, como los avisos (D-13).
3. `SugerenciaCategoriaService#sugerir` (`@Async`, **sin transacción**)
   termina enseguida si la clasificación está apagada. Si no, lee la URL de la
   foto, la descarga por `FotoStorageService` y la clasifica. Ese I/O ocurre
   sin ninguna conexión de la base tomada.
4. `ReporteService#registrarSugerencia` escribe en una **transacción corta**
   un `UPDATE` de tres columnas **condicionado a que sigan nulas**: la
   sugerencia se escribe una sola vez, y un segundo intento (otro evento, un
   reproceso futuro) no la reemplaza.

**La creación nunca espera ni falla por la clasificación.** Si el servicio
falla, la foto no se puede leer o no hay una sugerencia clara, las columnas
quedan nulas y el reporte sigue su curso. Un error del clasificador, aunque
sea inesperado, da «sin sugerencia» con un WARN; cualquier otro error
inesperado (leer la base, por ejemplo) escapa al manejador de `@Async`, que lo
registra.

**Lo que envía el cliente se ignora.** `POST /api/reportes` no tiene
parámetros de sugerencia, y las tres columnas son de **solo lectura para JPA**
(`insertable = false, updatable = false` en `Reporte`): ni la creación ni
ningún `save()` posterior pueden escribirlas. Eso además evita una carrera:
una edición del ciudadano o un cambio de estado del funcionario que cargó el
reporte antes de la sugerencia no la pisa con un nulo al guardar.

**SQL nativo, no `save()`.** El `UPDATE` toca solo esas columnas: un `merge`
de la entidad podría devolver a su valor viejo un estado que el funcionario
cambió mientras tanto. Tampoco mueve `updated_at`, porque la sugerencia es
interna y no debe notarse en ninguna fecha visible.

**Las tres columnas van juntas** (`CHECK ck_reporte_sugerencia_completa`): o
todas nulas o todas con valor. Así «sin sugerencia» es un estado claro, y la
versión identifica al modelo que produjo cada sugerencia (las del falso dicen
`falso-0`). Para OE3 se consulta por SQL; si hiciera falta una pantalla, sería
un endpoint del ADMIN.

### Por qué el catálogo es un puerto que implementa `reportes`

La política necesita las categorías activas con clase del modelo, que viven
en `reportes` (`CategoriaDano`). Pero `reportes` ya depende de
`clasificacion` (la sugerencia oficial llama a `ClasificacionService`), así
que si `clasificacion` llamara a `reportes` habría un **ciclo entre módulos**
(`modulosSinCiclos`). La dependencia se invierte: `clasificacion` declara lo
que necesita en `port/CategoriasClasificables` y `reportes` lo implementa en
su `infra/` (`JpaCategoriasClasificablesAdapter`, una consulta derivada). El
grafo queda `clasificacion ← reportes`, como en ARCHITECTURE.md §4.3, y
ArchUnit sigue sin violaciones. Alternativas descartadas: llevar la vista
previa a `reportes` (contradice el paso 1 de §4.3) o que el cliente envíe las
categorías candidatas (el cliente decidiría qué se puede sugerir).

### La sugerencia es una señal interna

Sale de un detector, así que **no va en ningún DTO** del reporte: ni en el
mapa y la búsqueda públicos, ni en las vistas del ciudadano (mis reportes, mis
adhesiones, editar, cancelar, crear o adherirse), ni en la bandeja, el cambio
de estado, el historial o la exportación del funcionario. Mostrársela al
funcionario es una decisión aparte (pregunta 5 de la propuesta).
`SugerenciaFueraDeDtosIT` lo fija endpoint por endpoint **sobre el cuerpo
entero**: con una sugerencia de valores reconocibles en el reporte, la
respuesta no puede contener esos valores ni ningún nombre de campo de la
sugerencia. `clase_modelo` tampoco está en el catálogo público.

### «Hueco en calzada» desactivada (V19)

En una foto no se distingue de «Bache» (la profundidad no se ve), y con dos
nombres para el mismo daño la deduplicación de US-09, que es por categoría,
deja crear dos reportes del mismo hueco. La gravedad la expresa la
`severidad` (NC-02). Es la decisión del usuario del 21/10.

- V19 la pone en `activo = false`: sale del catálogo público y crear con ella
  es 409, como con cualquier inactiva.
- **Los reportes que ya la usan no cambian**: guardan `categoria_id`, se
  siguen viendo con su categoría y el creador puede seguir editándolos sin
  cambiarla (`ReporteService#editar` solo valida la categoría cuando cambia).
  Lo prueba `CategoriasDelModeloIT`.
- **La deduplicación no cruza categorías.** Un «Bache» nuevo a 20 m o menos
  de un reporte activo de «Hueco en calzada» no se suma a él (US-09 busca la
  misma categoría): se crea un reporte aparte para el mismo daño. Y como el
  catálogo público ya no la ofrece, la PWA no puede filtrar el mapa por
  «Hueco en calzada». Las dos cosas solo afectan a datos que ya existían:
  **producción todavía no está desplegada** (v0.7.0 está lista, sin
  desplegar), así que allí no hay reportes con esa categoría; las bases de
  desarrollo sí pueden tenerlos. No se pasaron a «Bache» con la migración
  porque cambiaría lo que eligió el ciudadano.
- Las estándar no se reactivan por el API (US-29); volver atrás sería otra
  migración.

### El adaptador del servicio de inferencia (NC-04b)

`clasificacion/infra/InferenciaHttpAdapter` (`CLASIFICACION_TIPO=http`)
llama a `POST /v1/detecciones` del servicio `inferencia/` (RF-DETR Nano) por
la red privada, en `CLASIFICACION_URL`, según el contrato
`project-context/handoffs/2026-10-25-contrato-inferencia-v1.md`. Es el
adaptador de producción desde la v0.8.0 (decisión del usuario del 26/10).

| Decisión | Por qué |
|---|---|
| `RestClient` sobre el `HttpClient` del JDK, como `ResendCorreoAdapter` | Sin dependencias nuevas: la imagen está al borde de los 400 MB. |
| **HTTP/1.1 explícito** | Por defecto el cliente del JDK intenta HTTP/2 y, sobre `http://`, lo negocia con un `Upgrade: h2c` que uvicorn no habla. Con HTTP/1.1 cada conexión lleva una llamada a la vez, así que las conexiones abiertas, también las que quedan en keep-alive, nunca pasan de las llamadas simultáneas. |
| **Cuerpo en chunks** (`Transfer-Encoding: chunked`, sin `Content-Length`) | El multipart se escribe en streaming. uvicorn lo acepta, y el límite de cuerpo del servicio cuenta los bytes que recibe, no solo el `Content-Length` declarado (`inferencia/app/api/limite_cuerpo.py`). Lo comprueban `InferenciaHttpAdapterTest` con un servidor local e `InferenciaHttpAdapterIT` contra el servicio real. |
| **0,5 s de conexión + 2,5 s de lectura** (3 s como máximo) | El tope de la vista previa: el ciudadano espera la sugerencia mientras arma el reporte. La conexión es por la red privada y tarda milisegundos; la lectura se lleva casi todo porque incluye la espera en el servicio, que infiere de a una imagen. Spring 6.2 cuenta la lectura desde que sale el pedido hasta cerrar el cuerpo, así que también corta una respuesta que llega a medias. |
| **Turno (*bulkhead*): 4 llamadas a la vez; la vista previa no espera y la sugerencia oficial espera hasta 10 s** (NC-04c) | El `HttpClient` del JDK no limita sus conexiones y el servicio responde 503 desde 10 conexiones o tareas abiertas, contando las de keep-alive. Un `Semaphore(4)` lo mantiene lejos de ese tope. **La vista previa y la sugerencia oficial compiten por los mismos turnos**, pero no los esperan igual: la vista previa toma turno sin esperar (sin turno, «sin sugerencia» al instante), y la sugerencia oficial, asíncrona, espera uno hasta 10 s (ver «Espera de turno de la sugerencia oficial»). La oficial corre en su propio executor de 2 hilos, así que como mucho ocupa 2 turnos y quedan 2 para las vistas previas en curso. El turno propio de la vista previa solo acota el saneado y se suelta antes de clasificar, así que puede haber varias clasificando a la vez, una por ciudadano con la pantalla abierta. El tope protege al servicio; no reserva turnos para nadie. |
| **Sin reintentos** | La IA nunca bloquea un reporte (§4.3), y un reintento solo cargaría más a un servicio que ya no respondió. |
| **Cualquier falla es «sin sugerencia»** | Una respuesta distinta de 200, un timeout o un error de conexión se traducen a `ClasificacionNoDisponibleException`, que `ClasificacionService` convierte en «sin sugerencia» con un WARN. |
| **La respuesta se valida solo por su estructura** | Se rechaza entera si falta `version_modelo` o `detecciones`, si los tipos no son los del contrato o si `version_modelo` pasa de 40 caracteres (la columna). Se ignoran `caja` y los campos desconocidos. Una clase desconocida o una confianza fuera de [0, 1] **no** la invalidan: las descarta `PoliticaDeSugerencia` y las demás detecciones de la foto siguen valiendo. El cuerpo de un 200 se lee hasta **256 KiB** (100 detecciones caben en unos 10 KB): uno más grande es «fuera del contrato» y no se carga entero en memoria. |
| **La foto viaja sin datos del ciudadano** | La parte `imagen` lleva la foto **saneada** (sin EXIF) con el nombre fijo `foto.jpg`, nunca el del archivo original. |
| **`estaDisponible()` siempre `true`** | Un servicio caído se nota al llamarlo; no se adivina antes. |

**Una línea de log por llamada**, con su duración: es la medida de latencia
de DEP-13. El nivel separa las causas:

| Nivel | Ejemplo | Qué indica |
|---|---|---|
| `INFO` | `Inferencia: 200 en 287 ms, 1 deteccion(es), modelo rdd2022-…`; `la sugerencia oficial espero 224 ms por un turno` | Respondió; o la sugerencia oficial tuvo que esperar turno (NC-04c). |
| `WARN` | `error del servicio, HTTP 500, error_de_inferencia`; `servicio saturado, HTTP 503`; `sin respuesta en 2589 ms (HttpTimeoutException)`; `sin turno para la vista previa`; `la sugerencia oficial espero 10000 ms sin turno` | Un problema del servicio o de capacidad, pasajero. |
| `ERROR` | `pedido rechazado, HTTP 400, imagen_invalida`; `200 … fuera del contrato /v1` | Un defecto de un lado del contrato: la foto llega saneada (JPEG de 2048 px o menos), así que el servicio no debería rechazarla. Hay que corregirlo, no esperar. |

Del cuerpo de un error solo se copia el `codigo` del contrato, y solo si
tiene forma de código; nunca el `mensaje`.

**Medido contra el contenedor real** (`ciudadviva-inferencia:nc03` con
`--cpus=2` en la máquina de desarrollo, fotos sintéticas saneadas, dos
corridas de `InferenciaHttpAdapterIT` el 26/10): una llamada sola tarda
234–298 ms (457–651 ms la primera, que abre la conexión). Con seis a la vez,
cuatro toman turno y el servicio las atiende en fila: terminan a los ~0,3,
~0,55, ~0,8 y ~1,0 s (287–310, 526–563, 768–811 y 1002–1045 ms); las otras
dos reciben «sin turno» al instante y ninguna llega al 503. Con un servicio
mudo y los tiempos de producción, la llamada se corta a los 2,6 s. La
latencia en Railway se mide en DEP-13 con estas mismas líneas.

### Espera de turno de la sugerencia oficial (NC-04c)

Hasta NC-04c ninguna llamada esperaba turno: si coincidían más de cuatro, las
que no lo tenían daban «sin sugerencia». En la vista previa el ciudadano
elige a mano, pero **una sugerencia oficial sin turno se perdía**: las
columnas quedan nulas y no se reintenta (se escribe una sola vez), así que
esa foto contaba como «sin sugerencia» en la evaluación del modelo (OE3).
Decisión del usuario del 28/10: **la sugerencia oficial asíncrona espera
hasta 10 s por un turno**; la vista previa sigue igual.

- **El puerto dice quién llama, no cuánto esperar.**
  `ClasificadorDano#detectar(foto, origen)` recibe un
  `clasificacion/domain/OrigenDeConsulta` (`VISTA_PREVIA` o
  `SUGERENCIA_OFICIAL`): `ClasificacionService#vistaPrevia` pasa el primero
  y `ClasificacionService#sugerenciaOficial`, el segundo. Cuánto se espera es
  un detalle del adaptador HTTP, el único con turnos; el falso lo ignora.
  Pasar un tiempo de espera por el puerto obligaría a la aplicación a saber
  que hay turnos.
- **El adaptador** (`InferenciaHttpAdapter`): la vista previa usa
  `tryAcquire()` como antes; la oficial, `tryAcquire(espera)`. Si en el plazo
  no se libera un turno, se rinde con «sin sugerencia» (WARN con lo que
  esperó). Si el hilo se interrumpe mientras espera, se rinde y conserva la
  interrupción; es defensivo, porque al apagar el executor deja terminar la
  espera (ver «Executor asíncrono»). El semáforo no es justo: un turno que
  se libera puede tomarlo antes una vista previa que llega en ese instante, y
  la oficial sigue esperando hasta su plazo. Así la vista previa no cambia en
  nada, y la oficial no puede adelantarse a un ciudadano que espera en
  pantalla.
- **Configurable** para que los tests usen un plazo corto:
  `app.clasificacion.http.espera-turno-oficial-ms`
  (`CLASIFICACION_ESPERA_TURNO_MS`, 10000 por defecto, entre 0 y 60000; fuera
  de rango no arranca, porque mientras espera ocupa un hilo). Con 0, la
  oficial tampoco espera, como antes de NC-04c.
- **Un executor propio** (`ejecutorSugerencias`, 2 hilos fijos): esperar
  ocupa el hilo, y en el executor general retrasaría correos y avisos. El
  dimensionamiento y su justificación están en «Executor asíncrono»: con 2
  hilos, la oficial ocupa como mucho 2 de los 4 turnos.
- **Tiempo máximo de una sugerencia oficial**: la espera (10 s) más la
  llamada (3 s). Nadie la espera: la creación del reporte respondió antes.

**Medido contra el contenedor real** (28/10, misma imagen y máquina):
`InferenciaHttpAdapterIT` lanza seis sugerencias oficiales a la vez; cuatro
toman turno, las otras dos esperan 224 y 448 ms a que se libere uno, y las
seis reciben respuesta, ninguna un 503 ni «sin turno». Las mismas seis como
vista previa siguen dando dos «sin turno» al instante.

### Configuración

| Propiedad (variable) | Por defecto | Qué es |
|---|---|---|
| `app.clasificacion.tipo` (`CLASIFICACION_TIPO`) | `falso`; en `prod`, sin valor por defecto | `http` (`InferenciaHttpAdapter`) o `falso`. Otro valor no arranca. |
| `app.clasificacion.http.url` (`CLASIFICACION_URL`) | vacía | URL base del servicio, sin la ruta (`http://inferencia.railway.internal:8000`; en local, `http://localhost:8090`). Obligatoria con `http`: sin ella, sin esquema `http(s)` y host, o con ruta, query, fragmento o usuario, no arranca. Con `falso` no se mira. |
| `app.clasificacion.umbral` (`CLASIFICACION_UMBRAL`) | `0.50` | En (0, 1]; fuera de rango no arranca. |
| `app.clasificacion.http.espera-turno-oficial-ms` (`CLASIFICACION_ESPERA_TURNO_MS`) | `10000` | Cuánto espera la sugerencia oficial un turno (NC-04c), entre 0 y 60000 ms; fuera de rango no arranca. Solo con `http`. |
| `app.async.sugerencias.hilos` / `.cola` (`ASYNC_SUGERENCIAS_HILOS`, `ASYNC_SUGERENCIAS_COLA`) | `2` / `100` | El executor de la sugerencia oficial (NC-04c, ver «Executor asíncrono»). Los hilos, entre 1 y 3 (menos que los 4 turnos del adaptador); con `http`, fuera de rango no arranca. |
| `app.clasificacion.falso.respuesta` (`CLASIFICACION_FALSO_RESPUESTA`) | vacía | Lo que el falso «detecta» en cualquier foto. Si está mal escrita, no arranca. |
| `app.clasificacion.falso.version-modelo` | `falso-0` | Versión que informa el falso. |

- **`local`**: `falso` con `bache:0.87` por defecto, para ver la vista previa
  y la sugerencia sin el servicio de inferencia. Con el modelo real:
  `docker run --rm -d --name inferencia -p 8090:8000 --cpus=2 ciudadviva-inferencia`
  y `CLASIFICACION_TIPO=http CLASIFICACION_URL=http://localhost:8090`.
- **`prod`**: `CLASIFICACION_TIPO` **obligatoria**, sin valor por defecto
  (como `FOTOS_ALMACEN`, `CORREO_TIPO` y `CAPTCHA_TIPO`): `http` en el despliegue. La
  respuesta del falso sigue vacía y **literal**, no por entorno, así que
  `CLASIFICACION_TIPO=falso` es el interruptor para apagar la clasificación
  sin escribir nada más: `estaDisponible()` en `false`, nunca sugiere ni
  escribe, y ni sanea ni descarga fotos para eso. Una respuesta fija en
  producción llenaría la base de sugerencias inventadas y arruinaría la
  evaluación del modelo.
- **`test`**: `bache:0.87,grieta:0.30`, literal, para que un
  `CLASIFICACION_*` del entorno no cambie la suite. La sugerencia esperada es
  siempre «Bache» con 0,870.

### Pruebas

- Unitarias: `PoliticaDeSugerenciaTest` (las cuatro reglas, umbral exacto,
  empates, redondeo y rangos), `FalsoClasificadorAdapterTest`,
  `InferenciaHttpAdapterTest` (NC-04b, con `MockRestServiceServer`: 200 con y
  sin detecciones, con una clase desconocida y con confianza 1,5; 400, 413,
  500, 503 y otros estados; timeout (también cuando Spring 6.2 lo entrega
  como `CancellationException` y no envuelto, una carrera que apareció en
  la verificación de NC-04c); respuestas fuera del contrato, entre
  ellas sin `version_modelo` y con una de 41 caracteres; el nivel de log de
  cada causa; con seis llamadas simultáneas, a lo sumo cuatro llegan al
  servidor, y los turnos se devuelven también cuando la llamada falla; el
  tope de 256 KiB del cuerpo. Desde NC-04c, con los cuatro turnos ocupados:
  la sugerencia oficial espera y sigue cuando se libera uno; con un plazo
  corto se rinde sin llegar al servidor; la vista previa no espera (falla en
  menos de 1 s con la oficial configurada en 5 s); interrumpida mientras
  espera, se rinde y conserva la interrupción; la espera fuera de 0–60 s no
  arranca, y tampoco 4 o más hilos de sugerencias. Con sockets locales y un `@Timeout` de JUnit
  para no colgar la CI: HTTP/1.1 sin `Upgrade` y el cuerpo en chunks, que con
  los tiempos de producción un servicio mudo se corta por la lectura, una
  respuesta que se corta a medias y una conexión rechazada),
  `ValidacionTipoClasificadorTest` (con `http`, la URL: solo la base),
  `ClasificacionServiceTest` (la vista previa
  clasifica la foto **saneada** y pide `VISTA_PREVIA`; la oficial no la
  vuelve a sanear y pide `SUGERENCIA_OFICIAL`; una vista
  previa a la vez, sin esperar; sin turno de saneado, error inesperado del
  adaptador o clasificación apagada = «sin sugerencia»),
  `SugerenciaCategoriaListenerTest` (cola llena),
  `SugerenciaCategoriaServiceTest` (clasificación apagada, foto ausente,
  almacenamiento caído, URL que no es un nombre del servidor; desde NC-04c,
  que corre en el executor de las sugerencias y que con el hilo interrumpido
  no hace nada) y `AsyncConfigTest` (NC-04c: el executor de las sugerencias,
  con hilos fijos, cola acotada y rechazo con la cola llena; al apagar espera
  a la que corre y la encolada no empieza sin interrupción; el general sigue
  siendo el primario).
- Integración: `ClasificacionVistaPreviaIT` (rol, términos pendientes, no
  persiste, errores),
  `SugerenciaCategoriaIT` (se escribe una sola vez, lo del cliente se ignora,
  la adhesión no clasifica, la edición no la borra), `SugerenciaCategoriaFallaIT`
  (con el falso en `falla`, el reporte se crea igual y la vista previa es «sin
  sugerencia»; es el único contexto de Spring nuevo), `SugerenciaFueraDeDtosIT`
  y `CategoriasDelModeloIT` (V19). Desde NC-04b, `ArranqueClasificacionIT`
  (en `prod`, sin `CLASIFICACION_TIPO` o con `http` sin URL, no arranca) y
  `PerfilProdIT` (con `http`, el clasificador es el adaptador HTTP; la
  respuesta del falso sigue vacía).
- Contra el servicio real: `InferenciaHttpAdapterIT`, **solo si existe
  `CLASIFICACION_TEST_URL`** (como `S3FotoStorageServiceIT` con
  `FOTOS_S3_TEST_ENDPOINT`). La CI no construye la imagen (descarga torch y
  los pesos), así que no está en `CLASES_OBLIGATORIAS` y allí queda omitido.
  Comprueba que FastAPI acepta el multipart del adaptador, que la respuesta
  real cumple el contrato y es la misma para la misma foto (D-08), un 400
  real, que el turno mantiene al servicio lejos del 503, que seis
  sugerencias oficiales a la vez reciben respuesta todas (las sin turno
  esperan, NC-04c) y el flujo entero
  (vista previa y sugerencia oficial) con `CLASIFICACION_TIPO=http`. Las
  fotos son sintéticas: que el modelo encuentre un bache en una foto real lo
  prueba la prueba de humo del despliegue (DEP-13).
  ```bash
  docker run --rm -d --name inferencia-it -p 8090:8000 --cpus=2 ciudadviva-inferencia:nc03
  CLASIFICACION_TEST_URL=http://localhost:8090 mvn verify -Dit.test=InferenciaHttpAdapterIT
  docker stop inferencia-it
  ```

### Pendiente

- **Aviso de privacidad** (frontend y textos legales): decir que la foto se
  analiza automáticamente para sugerir una categoría y que la decisión es del
  ciudadano (DS 016-2024-JUS, art. 6.1).

## Moderación de contenido (NC-10b, D-15)

> Decisión del usuario del 28/10 (propuesta
> `project-context/decisions/propuestas/2026-10-28-moderacion-de-contenido.md`,
> ARCHITECTURE.md §4.3 y D-15). El servicio lo publica NC-10a
> (`handoffs/2026-10-28-contrato-moderacion-v1.md`); los avisos de la PWA son
> NC-10c (`handoffs/2026-10-29-moderacion.md`). Ocultar y denunciar lo ya
> publicado es NC-11.

Antes de publicar, el backend rechaza **una foto con contenido sexual u
obsceno** y **un texto con groserías**. Lo rechazado **no se guarda**: ni la
foto, ni el puntaje, ni el texto.

### Las piezas

Módulo nuevo `moderacion`, que solo usa `common`; lo usan `reportes`,
`clasificacion` (vista previa) y `auth` (nombre del perfil). Sin ciclos:
ocultar y denunciar (NC-11) viven en `reportes`, no aquí.

| Pieza | Capa | Qué hace |
|---|---|---|
| `port/ModeradorDeImagen` | Puerto | Mide una `FotoSaneada` (la misma que se guarda) y devuelve `PuntajeDeModeracion` (versión y puntaje). Solo mide. |
| `infra/InferenciaModeracionHttpAdapter` | Adaptador | `POST /v1/moderacion` del servicio `inferencia/` (`MODERACION_TIPO=http`). |
| `infra/SinModeracionAdapter` | Adaptador | `ninguna`: no revisa nada (local, tests y el interruptor de emergencia en `prod`, con un WARN al arrancar). |
| `infra/ValidacionTipoModeracion` | Arranque | Tipo, URL base y umbral, antes de crear ningún bean. |
| `infra/ListaDeGroseriasConfig` | Arranque | Lee `resources/moderacion/groserias-es-pe.txt`; sin archivo, sin versión, con una entrada inválida o vacío, no arranca. |
| `domain/PoliticaDeModeracion` | Dominio | Rechaza si `puntaje ≥ umbral` (0,70; entre 0,5 y 0,9). |
| `domain/FiltroDeGroserias` | Dominio | Regla pura: normaliza el texto y lo compara con la lista. |
| `service/ModeracionService` | Aplicación | `exigirTextoPermitido`, `exigirFotoPermitida` (creación) y `fotoRechazadaEnVistaPrevia`. Sin `@Transactional`. |

`common/exception/ContenidoNoPermitidoException` (400 con `codigo` y el campo
en `details`) y el `codigo` opcional de `ServicioNoDisponibleException` viven
en `common` porque `GlobalExceptionHandler` no puede depender de un módulo.

### Dónde se modera cada cosa

| Momento | Foto | Texto | Si el servicio no responde |
|---|---|---|---|
| Creación (`POST /api/reportes`) | Sí: saneada una vez, **sin transacción**, antes de subirla | `titulo`, `descripcion` | **503 `MODERACION_NO_DISPONIBLE`** (falla cerrada). Sin foto, el reporte se crea igual |
| Adhesión (US-09, mismo `POST`) | Sí: llega en el mismo pedido, se modera antes de saber si es adhesión | Igual | Igual |
| Reenvío idempotente (US-06) | **No**: la respuesta guardada vuelve antes de moderar | No | Recibe su respuesta aunque el servicio esté caído |
| Edición (`PATCH /api/reportes/{id}`) | — (no cambia la foto) | `titulo`, `descripcion` | — |
| Comentario (`POST /api/reportes/{id}/comentarios`) | — | `contenido` | — |
| Registro (`POST /api/auth/registro`) | — | `nombre`, `apellido`, **después del captcha** y antes del DNS | — |
| Perfil (`PATCH /api/auth/me`) | — (la foto de perfil es privada) | `nombre`, `apellido` | — |
| Vista previa (`POST /api/clasificaciones`) | Sí, sin esperar turno: `fotoRechazada` | — | `fotoRechazada: false` y la sugerencia de siempre |
| Sugerencia oficial (D-08) | **No**: la foto guardada ya pasó al crear | — | — |

No se filtran los tickets de soporte, el responsable asignado ni las
categorías: son privados o los escribe el personal municipal.

### Contrato

| Respuesta | Cuándo | Cuerpo |
|---|---|---|
| **400 `FOTO_NO_PERMITIDA`** | La foto supera el umbral | `message`: «La foto no está permitida. Toma otra.»; `details: ["foto"]` |
| **400 `TEXTO_NO_PERMITIDO`** | Un texto tiene una grosería de la lista | `message`: «La descripción tiene palabras que no están permitidas. Cámbiala para continuar.» (uno por campo); `details`: el campo del pedido (`titulo`, `descripcion`, `contenido`, `nombre` o `apellido`). **Nunca repite la palabra** |
| **503 `MODERACION_NO_DISPONIBLE`** | Sin respuesta, sin turno en 1 s, un 4xx/5xx del servicio o un 200 fuera de contrato, al crear con foto | `message`: «No pudimos revisar la foto en este momento. Guarda el reporte para enviarlo después o envíalo sin foto.» |
| `ClasificacionResponse.fotoRechazada` (`boolean`, nunca nulo) | Vista previa | `true` solo si la moderación rechazó la foto; entonces no se clasifica y la categoría es nula |

- **Por qué 400 y no 409.** Es la entrada la que no se puede publicar, no una
  precondición de estado (convención del proyecto: validación 400, negocio
  409, relación o rol 403). La PWA marca el campo con `details`.
- **Por qué el 503 no entra solo a la cola.** La PWA ya reintenta los 5xx
  desde la cola de US-06 con la misma `Idempotency-Key`; con el `codigo`
  puede además ofrecer «Enviar sin foto» (NC-10c).
- **`fotoRechazada` no es una señal interna.** Habla de la foto que el propio
  ciudadano acaba de subir, y la creación le daría el mismo veredicto. Por el
  mismo criterio que la confianza de la sugerencia, **no lleva el puntaje**:
  sería un instrumento para sondear el modelo foto a foto. Ningún DTO lleva el
  puntaje ni la versión del modelo de moderación.

### Falla cerrada y el interruptor

Decisión del usuario del 28/10 (propuesta §4, opción B): si el servicio no
responde, la foto **no** se acepta. Fallar abierto rompería «nunca se guarda
ni se publica» justo cuando el servicio cae (bastan 10 conexiones abiertas
para su 503). Los resguardos:

1. **`MODERACION_TIPO=ninguna`** es la salida de emergencia ante una caída
   larga. Mientras está puesto se publican fotos sin revisar; el filtro de
   texto sigue activo.
2. **Orden de despliegue:** primero el servicio con el modelo (NC-10a,
   DEP-13), después el backend con `http`. Hasta entonces, `ninguna`.
3. Un reporte **sin foto** nunca depende del servicio.

La vista previa, en cambio, **nunca falla** por la moderación: su veredicto
es solo un aviso, y el oficial es el de la creación.

### El adaptador HTTP

Sigue el patrón de `InferenciaHttpAdapter` (NC-04b): `RestClient` sobre el
`HttpClient` del JDK con HTTP/1.1 explícito, 500 + 2 500 ms, sin reintentos,
validación solo de la estructura (sin `version_modelo` o `puntaje`, tipos
distintos, un puntaje no finito o fuera de [0, 1], o una versión de más de 40
caracteres: fuera de contrato) y una línea de log con la duración de cada
llamada (sin el puntaje de una foto aceptada). **No se reutiliza el de
`clasificacion`**: es `infra` de otro módulo (ARCHITECTURE.md §4.3), así que
se copia el patrón.

- **Turno propio de 4 llamadas** (`Semaphore`), aparte del de la detección. El
  servicio responde 503 desde 10 conexiones abiertas **sumando los dos
  endpoints**, y 4 + 4 = 8 cabe con margen de una (handoff de NC-10a). No se
  puede subir uno sin bajar el otro, y con más de una réplica del backend hay
  que repartirlos.
- **La creación espera un turno hasta 1 s**: sin turno, el ciudadano recibe
  un 503, no «sin sugerencia». **La vista previa no espera.**
- Un 400 o 413 del servicio con la foto ya saneada es un defecto de un lado
  del contrato: queda en `ERROR`, aparte de las caídas (`WARN`).

**Latencia medida** contra el contenedor real (`InferenciaModeracionHttpAdapterIT`,
29/10, portátil con `--cpus=2`): 230–360 ms por moderación sola; con 4
moderaciones y 4 detecciones a la vez, la última moderación tardó ~2,1 s, cerca
de los 2,5 s de lectura. En Railway hay que volver a medirlo (DEP-13): si la
carga mixta pasa del timeout, una creación con foto recibiría 503.

### La lista de groserías

`resources/moderacion/groserias-es-pe.txt`, **propia del repositorio** (no
copia ninguna lista de terceros), versión `2026-10-29.1`, **153 entradas**:
137 palabras y 16 expresiones de varias palabras. La armó el agente de backend con los
criterios de la propuesta §5, que van en su cabecera; **el usuario aprueba la
versión inicial en el PR de NC-10b**.

- **Entra:** insultos vulgares inequívocos en el uso peruano con sus formas
  comunes (plural, femenino, aumentativo, abreviaturas como «ctm», «csm»,
  «ptm»), vulgaridades sexuales y escatológicas fuertes, insultos homofóbicos
  inequívocos y expresiones cuyas palabras sueltas son legítimas («concha de
  tu madre», «hijo de perra»).
- **No entra:** lo que tiene un sentido legítimo en un reporte o un nombre
  propio (concha, huevo, polla, paja, Pajero, perra, cono, ano, cholo, negro,
  chino…), los insultos que no son groserías (idiota, imbécil, estúpido: criticar
  a una autoridad no es una grosería) y las interjecciones leves (carajo,
  caramba). Lo que no atrapa la lista lo atrapa la denuncia (NC-11).

**Normalización** (`FiltroDeGroserias`): NFKC, sin caracteres de formato y en
minúsculas; sin tildes ni diéresis **pero con la ñ** («coño» no es «cono», ni
«año» es «ano»); *leetspeak* solo dentro de palabras con letras (0→o, 3→e,
4→a, 5→s, 7→t, @→a, $→s, y el 1 como i y como l), así que «km 15» no cambia;
`*` o `#` dentro de una palabra valen por una letra («p*ta»), siempre que haya
más letras que comodines; tres o más letras sueltas seguidas se unen («p u t
a», «C.T.M.»); y cada palabra se compara con sus rachas de 3 o más letras
reducidas a 2 y a 1 («putaaa»). Las entradas no se reducen: «pera» no es
«perra».

**El problema de Scunthorpe.** Se compara **por palabra entera** (o por
secuencias de 2 a 4 palabras para las expresiones), **nunca por subcadena**:
«vehículo», «obstáculo», «película», «disputa», «computadora» o el apellido
«Culqui» no coinciden. Lo protegen dos guardas:

- `ListaDeGroseriasTest`: el archivo tiene versión, ninguna entrada duplicada
  y cada una escrita ya normalizada; el filtro detecta cada entrada; y
  **ninguna línea ni palabra** del corpus legítimo
  (`test/resources/moderacion/corpus-legitimo.txt`: vocabulario vial, los 43
  distritos, apellidos y nombres frecuentes y las palabras legítimas de la
  propuesta y siglas frecuentes de Lima: 434 líneas) coincide con la lista.
  **Riesgo que queda: las abreviaturas.** «ctm», «csm», «ptm», «hdp» y «mrd»
  coinciden como palabra entera, también escritas con puntos o espacios
  («C. S. M.»): una sigla legítima con esas letras daría 400. Ninguna sigla
  frecuente de Lima del corpus choca, pero el usuario decide al aprobar la
  lista si se quedan. Si una palabra legítima
  empieza a coincidir, se corrige la lista, no el corpus.
- `FiltroDeGroseriasTest`: cada paso de la normalización, en positivo y en
  negativo.

**El texto no depende de ningún servicio**: es una regla pura, sin puerto
(D-04). La PWA no duplica la lista: el 400 llega al instante y el formulario
conserva lo escrito.

### El orden de las validaciones

- **Creación:** idempotencia → campos → **texto** → saneado → **foto** →
  subida → transacción. El texto va antes que la foto: no cuesta nada y no
  gasta un turno del servicio en un reporte que igual se rechaza. La
  moderación de la foto corre **sin transacción**
  (`ModeracionCreacionIT` lo comprueba desde el doble del puerto).
- **Registro:** captcha (NC-08) → **nombre y apellido** → dominio del correo
  (NC-09) → términos y correo duplicado. El captcha sigue primero; el filtro,
  que es puro, va antes de la consulta DNS.
- **Edición del reporte:** el texto nuevo se revisa antes de cambiar nada.
- **Comentario:** el texto se revisa primero, como el resto de la validación
  de la entrada.

### Registro (log)

- Foto rechazada al crear: `WARN` con el **id del usuario**, el puntaje
  redondeado a dos decimales y la versión del modelo. Así se ve si alguien
  insiste, sin datos de más. En la vista previa, el mismo `WARN` sin usuario
  (el servicio de `clasificacion` no lo conoce).
- Texto rechazado: `WARN` con el campo, la **entrada de la lista** que
  coincidió y la versión de la lista. **Nunca el texto** del ciudadano.
- Moderación no disponible al crear: `WARN` con el usuario y la causa.

### Pruebas

- Unitarias: `FiltroDeGroseriasTest`, `ListaDeGroseriasTest`,
  `PoliticaDeModeracionTest` (el borde del umbral y el rango),
  `ModeracionServiceTest` (códigos, mensajes, falla cerrada, la vista previa
  que nunca falla y qué queda en el log), `ValidacionTipoModeracionTest` e
  `InferenciaModeracionHttpAdapterTest` (con `MockRestServiceServer`: 200, 200
  sin `version_modelo` o sin `puntaje`, `puntaje` 1,5, −0,01, de texto o no
  finito, versión de 41 caracteres, 400, 413, 500, 503, timeout; con seis vistas
  previas a la vez, a lo sumo cuatro llegan al servidor y las otras no
  esperan; la creación espera un turno y sigue, o se rinde en el plazo; con
  sockets locales, HTTP/1.1 en chunks, el timeout real y una conexión
  rechazada). `ClasificacionServiceTest` suma la vista previa con la
  moderación y que la sugerencia oficial no la llama.
- Integración: `ModeracionCreacionIT` (foto rechazada: 400, sin reporte, sin
  adhesión, sin `ReporteCreadoEvent` y sin objeto en el almacenamiento; sin
  servicio: 503 y nada creado; sin foto, el moderador no se llama; el reenvío
  idempotente con el servicio caído; sin transacción al moderar; **la
  sugerencia oficial, cero llamadas al moderador**, contadas por el doble),
  `VistaPreviaModeracionIT`, `ModeracionTextoIT` (edición, comentario, perfil
  y registro, con el captcha primero) y `ArranqueModeracionIT` (en `prod`, sin
  `MODERACION_TIPO`, con un valor no admitido, con `http` sin URL o con un
  umbral fuera de rango, no arranca). `PerfilProdIT` arranca con `http`.
- Contra el servicio real: `InferenciaModeracionHttpAdapterIT`, **solo si
  existe `MODERACION_TEST_URL`** (fuera de `CLASES_OBLIGATORIAS`). Comprueba
  el contrato, un 400 real, el mismo puntaje en la vista previa y en la
  creación, que 4 moderaciones y 4 detecciones a la vez no reciben un 503, y
  la creación y la vista previa con el servicio real. **No hay muestras
  positivas y no se van a juntar**: el rechazo se prueba con el doble.
  ```bash
  docker run --rm -d --name inferencia-it -p 8010:8000 --cpus=2 ciudadviva-inferencia:nc10a
  MODERACION_TEST_URL=http://localhost:8010 mvn verify -Dit.test=InferenciaModeracionHttpAdapterIT
  docker stop inferencia-it
  ```

### Pendiente

- **Despliegue (DEP-13):** `MODERACION_TIPO=http` y `MODERACION_URL` en
  Railway, solo después del servicio con el modelo; la latencia con carga
  mixta, medida allí; el interruptor y la purga manual van al runbook.
- **Calibración del umbral** con fotos de calles con gente y de Lima (NC-10a,
  «Dudas»): 0,70 se mantiene hasta entonces.
- **Términos v2** (PR #116): el párrafo de la revisión del contenido sale en la
  misma versión que este código (v0.8.0).

## Ocultar y denunciar (NC-11a, D-15)

Red de seguridad de la moderación automática (NC-10b): **el ADMIN oculta un
reporte o solo su foto** ya publicados, con un motivo, y **los ciudadanos
denuncian** un reporte público. Diseño: `project-context/decisions/propuestas/2026-10-28-moderacion-de-contenido.md`
§6, decidido por el usuario el 28/10. Vive en `reportes` y no en `moderacion`:
si viviera allí, `moderacion` usaría `reportes` y habría un ciclo
(ARCHITECTURE.md §4.3).

### Las piezas

| Pieza | Qué hace |
|---|---|
| V21 | `reporte.oculto` y `reporte.foto_oculta` (por separado), índice en `reporte.foto_url`, cuatro tipos de evento en `historial_estado_reporte` (sin estados y con el motivo obligatorio), la tabla `denuncia_reporte` y la vista del índice creada de nuevo con `AND NOT r.oculto` |
| `DenunciaReporteController` / `DenunciaReporteService` | `POST /api/reportes/{id}/denuncias` (CIUDADANO) |
| `ModeracionReporteController` / `ModeracionReporteService` | `/api/admin/moderacion/reportes/**` (ADMIN) |
| `reportes/infra/FotosDeReporteWebConfig` | sirve `/media/fotos/reportes/**` solo si la foto es visible |
| `ReporteVisibilidadCambiadaEvent` | ocultar o restablecer el reporte refresca el índice (AFTER_COMMIT) |
| `SeguimientoReporteService` | redacta las entradas de moderación según quién lee |

### Las rutas

| Ruta | Rol | Respuestas |
|---|---|---|
| `POST /api/reportes/{id}/denuncias` `{motivo, detalle?}` | CIUDADANO | 201; 404 si el reporte no existe, está cancelado u oculto; 409 `DENUNCIA_PROPIA`, `DENUNCIA_REPETIDA` o `LIMITE_DENUNCIAS`; 400 |
| `GET /api/admin/moderacion/reportes?estado=PENDIENTE` | ADMIN | página de reportes con denuncias en ese estado, de más a menos denunciados y, entre iguales, del que espera hace más; con el conteo por motivo |
| `GET /api/admin/moderacion/reportes?ocultos=true` (NC-11a2) | ADMIN | página de reportes con el reporte **o** la foto ocultos, tengan denuncias o no, lo ocultado más recientemente primero; `estado` no filtra (si viene, debe ser válido) y el resumen cuenta todas las denuncias. Mismo DTO |
| `GET /api/admin/moderacion/reportes/{id}` | ADMIN | el reporte (en cualquier estado), su moderación y sus denuncias con el denunciante; 404 |
| `GET /api/admin/moderacion/reportes/{id}/foto` | ADMIN | la foto aunque esté oculta; 404 sin foto |
| `POST /api/admin/moderacion/reportes/{id}/ocultamiento` `{alcance, motivo}` | ADMIN | 200; 409 `YA_OCULTO` o `SIN_FOTO`; 400 |
| `POST /api/admin/moderacion/reportes/{id}/restablecimiento` `{alcance, motivo}` | ADMIN | 200; 409 `NO_OCULTO` o `SIN_FOTO`; 400 |
| `POST /api/admin/moderacion/reportes/{id}/desestimacion` `{motivo?}` | ADMIN | 200, también sin pendientes |

Ninguna es pública (`SecurityConfig` no cambia); el funcionario y el ciudadano
reciben 403 en las del ADMIN, y el funcionario y el ADMIN en la de denunciar.
Las del ADMIN responden con `Cache-Control: no-store, private`, porque traen
la identidad de quien denunció o la foto oculta.

### Qué ve cada quien

- **Reporte oculto:** sale de la búsqueda, del área, de la densidad, del
  detalle público (404), de los comentarios (404 al leerlos y al comentar),
  de `mis-adhesiones`, de la deduplicación, de la bandeja municipal (y de sus
  conteos de US-17), del índice y de la exportación. Su creador lo sigue
  viendo en `mis-reportes`, sin foto. En el historial, el creador y el ADMIN
  reciben 200; el funcionario del distrito y los adheridos, **404**; los
  demás, el 403 de siempre. El funcionario también recibe 404 al cambiarle el
  estado y en el responsable (GET y POST). El 404 va después de la
  jurisdicción: el funcionario de otro distrito sigue recibiendo 403, sin
  enterarse de que está oculto.
- **Foto oculta:** el reporte sigue visible y contando en el índice, con
  `fotoUrl` en `null` en todo DTO que no es del ADMIN; la URL de la foto da
  404.
- **Al restablecer, todo vuelve a como era antes.**
- **Ningún DTO público gana un campo** (`DtoPublicosSinModeracionTest` fija
  la lista de `ReporteResumenResponse`, `ReporteResponse`,
  `ReporteGestionResponse` y `ComentarioPublicoResponse`). Las denuncias solo
  van en los DTO del ADMIN (`ReporteModeracionResponse`,
  `ReporteModeracionResumenResponse`, `DenunciaResponse`): ni el creador ni el
  funcionario saben quién ni cuántos denunciaron.

### La línea de tiempo

Los cuatro eventos (`FOTO_OCULTA`, `REPORTE_OCULTO`, `FOTO_RESTABLECIDA`,
`REPORTE_RESTABLECIDO`) llevan el motivo en `comentario` y al ADMIN en
`autor_id`: la línea de tiempo sigue siendo **única** (V4).

| Quién lee (si tiene acceso) | `comentario` | `autor` |
|---|---|---|
| ADMIN | el motivo | el ADMIN |
| Creador y funcionario | el motivo | «Moderación de Ciudad Viva» |
| Adheridos | «Se ocultó contenido de este reporte por las reglas de uso.» o «Se restableció contenido de este reporte.» | «Moderación de Ciudad Viva» |

`HistorialEntradaResponse` suma `avisoIndice`, un texto fijo **que arma el
servidor y no el ADMIN**: en `REPORTE_OCULTO`, «Mientras esté oculto, este
reporte no cuenta en el índice de desempeño.», y en `REPORTE_RESTABLECIDO`,
«Vuelve a contar en el índice de desempeño.». En el resto, `null`. Así el
creador sabe por qué su reporte dejó de pesar en la métrica, y cada salida
del índice queda auditada.

### El motivo no delata a quien denunció

Lo leen el creador y el funcionario, y los términos v2 (§5) prometen que
quien hizo el reporte no sabe quién lo denunció. El servidor nunca agrega al
motivo datos de las denuncias (ni la identidad ni el conteo), y rechaza con
**400 `MOTIVO_IDENTIFICA_DENUNCIANTE`** (con `motivo` en `details`, como el
400 de la moderación del texto) un motivo que contenga, sin distinguir
mayúsculas, el correo de un denunciante de ese reporte. Lo demás lo cubre el
aviso del diálogo del ADMIN en la PWA (NC-11b). El motivo tiene de 10 a 500
caracteres sin los espacios del borde.

### Decisiones de implementación

- **`UPDATE` condicional y sin `updated_at`.** `oculto` y `foto_oculta` son de
  solo lectura para JPA, como la sugerencia de NC-04: los escribe
  `ReporteRepository#cambiarOculto` / `#cambiarFotoOculta` con
  `WHERE ... <> :valor`. Dos ADMIN simultáneos no duplican la entrada del
  historial (el segundo recibe 409), un `save()` del ciudadano o del
  funcionario no puede restablecer el reporte con un valor viejo, y ocultar no
  mueve `updated_at`, que mide los reportes estancados de US-17.
- **La vista de ocultos de la bandeja (NC-11a2, decidido el 30/10).** Sin
  ella, un reporte oculto sin denuncias no aparecía en ninguna lista y el
  ADMIN no podía revisar lo que ocultó ni restablecerlo desde ahí. Es una
  consulta aparte (`ReporteRepository#ocultosParaModeracion`), no un
  parámetro opcional en la de denuncias: evita la trampa de `:param IS NULL`
  en Postgres y cada consulta conserva su orden. **El orden sale del
  historial**, no de `updated_at`: el `REPORTE_OCULTO` o `FOTO_OCULTA` más
  reciente cuyo alcance siga oculto, porque ocultar no mueve `updated_at` a
  propósito (punto anterior) y un cambio de estado del funcionario sí lo
  movería (un reporte con solo la foto oculta sigue en su bandeja). Sin
  migración: ninguna columna del `WHERE` tiene índice, así que la consulta y
  su `countQuery` recorren `reporte` completa, un recorrido aceptable a la
  escala de la tesis y en una ruta que solo usa el ADMIN; el `JOIN` al
  historial sí usa `ix_historial_reporte` (V1). Si la tabla creciera, un
  índice parcial `ON reporte (id) WHERE oculto OR foto_oculta` (una V22) lo
  resuelve sin tocar la consulta. `estado`, si viene, tiene que ser un valor
  válido (si no, 400 como siempre); con `ocultos=true` simplemente no
  filtra. El resumen de denuncias cuenta todas,
  en cualquier estado (`resumenEnCualquierEstado`,
  `conteoPorMotivoEnCualquierEstado`): en esta vista `totalDenuncias` puede
  ser 0 y `primeraDenuncia`/`ultimaDenuncia` nulas; el DTO no cambia.
- **Las denuncias no ocultan nada (SEC-01).** Ocultar atiende las pendientes
  (`ATENDIDA`, con el motivo en `motivo_resolucion`); desestimar las pasa a
  `DESESTIMADA`. `motivo_resolucion` no estaba en la propuesta: se agregó para
  guardar el motivo opcional de la desestimación, y solo lo leen los DTO del
  ADMIN.
- **Tope de denuncias:** `app.moderacion.denuncias-por-dia` (10 por defecto),
  en una **ventana móvil de 24 h**, no por día calendario. El `UNIQUE
  (reporte_id, denunciante_id)` cubre los envíos simultáneos (el segundo
  recibe el mismo 409). **El tope no es atómico:** el conteo va antes del
  `INSERT`, así que varias denuncias simultáneas del mismo ciudadano a reportes
  distintos pueden pasarlo por unas pocas. Se acepta a esta escala, porque una
  denuncia de más no oculta nada; si hiciera falta cerrarlo, un
  `pg_advisory_xact_lock(denunciante_id)` antes de contar.
- **BE-14 (cierre de cuenta):** las denuncias se conservan mientras exista el
  reporte; al cerrar la cuenta hay que anonimizar al denunciante con
  `DenunciaReporteRepository#anonimizarDenunciante`. Por eso
  `denuncia_reporte.denunciante_id` admite NULL (la propuesta lo tenía `NOT
  NULL`): así BE-14 no necesita otra migración. El gancho está probado en
  `DenunciaReporteIT`.
- **La foto (D-15, opción A).** El *resource handler* pasó con `git mv` de
  `common/config/WebMvcConfig` a `reportes/infra/FotosDeReporteWebConfig`. Su
  resolver pregunta a `ReporteRepository#existeFotoVisible` (una consulta por
  `ix_reporte_foto_url`) antes de cargarla por `common.port.FotoStorageService`;
  si no, 404 sin llamar a R2. No hay puerto nuevo en `common/port`, que es
  solo para E/S externa. El ADMIN la ve por su ruta, que la PWA muestra como
  `blob:`.
- **Caché de la foto:** `Cache-Control: max-age=2592000, public,
  s-maxage=3600, immutable`. El borde de Cloudflare deja de servir una foto
  oculta en una hora como máximo; para un caso urgente, la purga manual de la
  URL. El navegador conserva sus 30 días: lo que ya descargó no se puede
  retirar. **Falta comprobar** con `curl -sI` en producción que Cloudflare
  respeta `s-maxage`.

### Pruebas

- `OcultamientoReporteIT` (21): cada fila de la tabla de visibilidad, el
  historial por rol con el reporte oculto y después de restablecerlo, la foto
  oculta (DTO, `/media`, ruta del ADMIN), la foto sin reporte, 409, 400, 403,
  el correo del denunciante en el motivo y que ninguna respuesta del creador,
  del funcionario o del público traiga denuncias, la bandeja del ADMIN y la
  desestimación, la vista de ocultos (NC-11a2: con y sin denuncias, solo la
  foto, el orden, `estado` ignorado, `ocultos=false` igual que antes, 403), y
  la deduplicación.
- `DenunciaReporteIT` (14): 201, 409 (repetida, propia, tope y la ventana de
  24 h), 404 (oculto, cancelado, inexistente), 401, 403, 400 y el gancho de BE-14.
- `IndiceSinOcultosIT` (5): ocultar el reporte baja `total_reportes`,
  `total_resueltos` y las calificaciones del distrito y de su categoría por el
  evento, sin refrescar a mano; restablecerlo los devuelve; ocultar la foto no
  cambia ni refresca nada; el ranking público y la exportación; los
  estancados de US-17.
- `DtoPublicosSinModeracionTest` (4) y `reportes/domain/ModeracionDominioTest` (4).

### Pendiente

- **Runbook** (`docs/despliegue.md`, fuera de `backend/`): la purga manual de
  una URL en Cloudflare y el procedimiento ante material ilegal (este último,
  cuando el usuario lo confirme con su asesor).
- La notificación al creador cuando se oculta, ocultar un comentario suelto y
  borrar la foto oculta quedan fuera de alcance (ficha NC-11).

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
  - **Conexiones (NC-10b):** la base es una sola para toda la suite, y Spring
    guarda en cache cada contexto de test distinto (uno por combinación de
    `@MockitoBean`, perfiles y propiedades) con su pool de Hikari abierto.
    Con 11 contextos y los 10 ociosos por pool de Hikari se pasaba del
    `max_connections` de 100 de PostgreSQL («too many clients already»).
    `application-test.yml` deja cada pool con **1 conexión ociosa** y 10 s de
    inactividad (el máximo sigue en 10). Al sumar un IT con un `@MockitoBean`
    nuevo, conviene reutilizar el de otra clase (mismo tipo y mismo nombre de
    campo) para compartir el contexto.
  - **A revertir cuando:** Testcontainers publique una versión con `docker-java`
    compatible con Docker 29 (o se fije `<testcontainers.version>` a una que lo
    soporte). La migración es local a `AbstractPostgisIT` — el resto de los
    tests no cambia.
- **La foto de perfil se sube dentro de la transacción** de la edición del
  perfil (DEP-12). Con R2 son ~100–500 ms de red con una conexión del pool
  retenida, y antes, si no hay turno de saneado, hasta 10 s de espera también
  con la conexión tomada. Se acepta: cambiar la foto de perfil es poco
  frecuente, y está acotado por los timeouts del cliente (10 s) y del
  semáforo (10 s). La foto de un reporte ya no tiene esta deuda: BE-11 la
  sanea y la sube sin transacción (ver [La foto del reporte, fuera de la
  transacción](#la-foto-del-reporte-fuera-de-la-transacción-be-11)). NC-04 ya
  lo acotaba así: la sugerencia oficial corre en el executor asíncrono y solo
  toma una conexión para leer la URL de la foto y para el `UPDATE` final,
  nunca durante la descarga ni la clasificación; y la vista previa ocupa como
  mucho uno de los dos turnos de saneado y no espera el suyo. Con el modelo
  real (NC-04b), la inferencia (hasta 3 s) tampoco retiene una conexión.
- **Fotos huérfanas.** Desde BE-11 la foto de un reporte que no llega a
  usarse (la transacción se revierte, o el pedido termina en adhesión o en un
  reenvío idempotente) se borra después de la transacción. Quedan huérfanas
  solo si ese borrado falla (R2 caído: un WARN con el nombre), si no se sabe
  si el commit llegó a la base (se conserva a propósito) o si la edición del
  perfil se revierte después de subir la foto nueva.
- **Correo sin reintentos ni registro de envíos (DEP-08).** Si el proveedor
  rechaza o no responde, el correo de recuperación o de soporte se pierde y
  solo queda un WARN con el id (la persona puede volver a pedir el token; la
  respuesta de soporte queda visible en la app). NC-05 (ENVIO_CORREO) traerá
  los intentos registrados. El tope de recuperación es por cuenta: no hay un
  límite de tasa general por IP.
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
`consentimiento` (V13 y V14, NC-07b), `municipalidad` y `periodo_gestion`
(V15 y V16, NC-01) y `token_confirmacion_correo` (V20, NC-09), o columnas,
como la sugerencia de categoría de `reporte` y la clase del modelo de
`categoria_dano` (V19, NC-04) y `usuario.correo_confirmado` (V20, NC-09).

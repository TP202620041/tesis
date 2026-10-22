# Propuesta: despliegue del MVP (Railway + Vercel + R2 + correo HTTP)

- **Estado:** aceptada (2026-10-21) <!-- abierta | aceptada | rechazada -->
- **Fecha:** 2026-10-21
- **Origen:** subagente arquitecto, encargo ARQ-1, sobre `develop` = `main` = v0.6.0 (14ef98d)
- **Decide:** el usuario. Si se acepta, la sesión de raíz actualiza ARCHITECTURE.md o el plan.
- **Relacionadas:** `2026-10-21-correo-saliente-http.md` (DEP-08), `2026-10-21-fotos-r2.md` (DEP-12), `2026-10-21-decisiones-pendientes.md` (todo lo que decide el usuario). Runbook: `docs/despliegue.md`. Diagrama: `docs/arquitectura/c4-despliegue.md`.

> Las cifras de precios, límites y licencias salen de las páginas oficiales consultadas el **21/10/2026** (fecha de la página cuando la muestra). Lo marcado **NO VERIFICADO** es un supuesto que se comprueba en el primer despliegue.

## Contexto

### Decisiones ya tomadas por el usuario (21/10)

- **Fotos:** Cloudflare R2 con bucket privado; el backend las sirve con las **mismas URLs** de hoy (`/media/fotos/reportes/…` públicas y `/api/perfiles/fotos/{uuid}` solo para el dueño), sin cambio de contrato ni de CSP. Adaptador S3 detrás de `common/port/FotoStorageService`; el adaptador local se queda para desarrollo y tests. Quitar el EXIF al subir.
- **Hosting:** Railway (backend en contenedor + PostgreSQL con PostGIS `postgis/postgis:16-3.4`) y Vercel (PWA, raíz `frontend/`, rama de producción `main`).
- **Correo:** por servicio HTTP (Brevo o Resend), porque el plan Hobby de Railway bloquea el SMTP saliente.
- **ML:** se proponen las clases del modelo; NC-04 avanza con un adaptador falso mientras el usuario decide.

### Lo que hoy impide desplegar (verificado en el código)

| Hallazgo | Dónde | Efecto en producción |
|---|---|---|
| `JWT_SECRET` tiene un valor por defecto versionado | `backend/src/main/resources/application.yml:96`, `backend/.env.example` | Si falta la variable, la API arranca firmando con un secreto público: cualquiera puede emitir un token de ADMIN. |
| No hay perfil de producción; el perfil por defecto es `local` (SQL en el log, DEBUG) | `application.yml`, `application-local.yml` | `application-dev.yml` sirve de base (exige `DB_*`), pero no fija puerto, logs ni actuator. |
| `/actuator/health` es pública en `SecurityConfig.java:72`, pero falta `spring-boot-starter-actuator` | `pom.xml` | Railway no tiene contra qué hacer el health check. |
| Swagger UI y `/v3/api-docs` públicos | `SecurityConfig.java:69-71` | Expone el contrato completo; útil en desarrollo, innecesario en producción. |
| `server.error.include-message: always` | `application.yml:106` | Los errores que no pasan por `GlobalExceptionHandler` (filtros) devuelven el texto interno. Cambiarlo a `never` no rompe la PWA: `frontend/src/lib/api/errors.ts` lee el `message` que arma `GlobalExceptionHandler.build()`. |
| `spring.flyway.baseline-on-migrate: true` | `application.yml:21` | Contra una base con tablas y sin historial de Flyway (por ejemplo, un volcado mal restaurado), marca la línea base y salta las migraciones sin avisar. |
| Sin timeouts SMTP; `PasswordResetService` envía dentro de `@Transactional`; el indicador de salud del correo apuntaría a `localhost:1025` | `application.yml:28-36`, `auth/service/PasswordResetService.java:55-70` | Un servidor de correo lento bloquea hilos y conexiones del pool; el health check daría `DOWN`. Detalle en la propuesta de correo. |
| Excepciones sin manejador propio caen en el `Exception.class` genérico: un archivo de más de 10 MB, un método no permitido o un parámetro faltante dan **500**, y ese manejador **no registra nada** en el log | `common/exception/GlobalExceptionHandler.java:127-130` | 500 sin rastro. Además, si Tomcat corta la conexión al pasarse del límite, la PWA lo ve como `NetworkError` y mete el reporte en la cola offline, que lo reintentaría una y otra vez. |
| Las fotos se guardan en el disco del proceso | `common/infra/LocalFotoStorageService` | El disco de un contenedor de Railway no persiste entre despliegues: cada versión nueva borraría todas las fotos. |
| Exportar a Excel usa `autoSizeColumn` de POI, que necesita fuentes del sistema | `reportes/infra/ExcelReportesExportador` | La imagen base debe ser Debian/Ubuntu con `fontconfig` (la `eclipse-temurin:21-jre-noble` lo trae, según su Dockerfile oficial), no Alpine. |
| No hay forma de crear el primer ADMIN ni de asignar funcionarios: el registro siempre crea CIUDADANO | `auth/service/AuthService.java:57` | En producción nadie podría gestionar reportes ni responder tickets. D-10 (jurisdicción por distrito o por municipalidad) sigue abierta. |
| `NEXT_PUBLIC_API_BASE_URL` se hornea en el build y entra a la CSP | `frontend/next.config.ts:4`, `frontend/src/lib/api/client.ts:17` | Cambiar la URL del API exige reconstruir la PWA. |
| Faltan los iconos del manifest (`public/icons/icon-192.png`, `icon-512.png`) y no hay `.env.example` del frontend (`frontend/.gitignore` ignora `.env*`) ni versión de Node fijada | `frontend/src/app/manifest.ts`, `frontend/public/`, `frontend/package.json` | Android no ofrece instalar la PWA con iconos rotos; cada máquina construye con su propio Node. |
| No hay CI | `.github/` no existe | Lo único que comprueba un PR es la verificación local del agente. |

## Problema

Llevar v0.6.0 a una URL pública estable sin secretos por defecto, sin depender del disco del contenedor ni del SMTP, y con un procedimiento que cualquiera pueda repetir y verificar.

## Arquitectura propuesta

Diagrama y lectura en `docs/arquitectura/c4-despliegue.md`. Resumen:

| Pieza | Dónde | Cómo |
|---|---|---|
| PWA | Vercel, plan Hobby, proyecto con *Root Directory* `frontend`, rama de producción `main`, Node 24.x | Build `npm run build` (Next + Serwist). Solo se construye `main` (preset «Only build production» del *Ignored Build Step*). |
| API | Railway, servicio `backend`, región **US East (Virginia)** (no hay región en Sudamérica) | Imagen desde `backend/Dockerfile` (multi-etapa, JRE 21 Ubuntu noble, usuario no root), perfil `prod`, health check `/actuator/health`, *watch paths* `/backend/**`. Dominio `*.up.railway.app`. |
| Base de datos | Railway, servicio `postgis` con imagen `postgis/postgis:16-3.4` y un volumen | Volumen en `/var/lib/postgresql/data` con `PGDATA=/var/lib/postgresql/data/pgdata` (el volumen nuevo trae `lost+found` y `initdb` falla si se usa la raíz). **Sin TCP Proxy público**: el API llega por la red privada (`postgis.railway.internal`). |
| Respaldo | Railway, servicio cron `respaldo-bd` desde la plantilla oficial «Postgres S3 Backups» (`railwayapp-templates/postgres-s3-backups`) | `SINGLE_SHOT_MODE=true`, cron `0 8 * * *` UTC (03:00 en Lima), `PG_VERSION=16`, sube el volcado a un bucket R2 de respaldos. |
| Fotos | Cloudflare R2: buckets privados `…-fotos-reportes` y `…-fotos-perfiles` | El API las guarda y las lee con la API S3 y las sirve en las rutas de hoy (propuesta `2026-10-21-fotos-r2.md`). |
| Correo | Brevo o Resend por API HTTP | Propuesta `2026-10-21-correo-saliente-http.md`. |
| Push | Servicios Web Push del navegador | Sin cambios (VAPID por variables). |
| CI | GitHub Actions | Pruebas en cada PR; el despliegue lo hacen las integraciones de Vercel y Railway al fusionar en `main`. |

**Por qué Railway despliega solo `main`:** `main` recibe únicamente versiones etiquetadas (WORKFLOW.md §8). Un PR de `release/vX.Y.0` fusionado es exactamente un despliegue.

### Opciones que quedaban abiertas dentro de lo decidido

| Tema | Opción | Pros | Contras | Recomendación |
|---|---|---|---|---|
| **Configuración de Railway** | `railway.toml` en `backend/` (lo pedía el encargo) | Versionada. | **Railway deprecó *Config as Code***: desde el 28/08/2026 los servicios de proyectos nuevos no se despliegan con `railway.toml`/`railway.json`, y desde el 01/12/2026 dejan de leerse ([docs.railway.com/reference/config-as-code](https://docs.railway.com/reference/config-as-code), banner de deprecación; [changelog del 20/08/2026](https://railway.com/changelog/2026-08-20-railway-anon)). | **No usarlo.** |
| | Configuración en el panel, registrada paso a paso en `docs/despliegue.md` | Funciona hoy; el runbook la hace reproducible. | Puede desviarse del documento si alguien cambia el panel. | **Sí, para v0.7.0.** |
| | *Infrastructure as Code* (`.railway/railway.ts`, `railway config plan/apply`) | El reemplazo oficial, versionado. | Muy nuevo; su referencia no muestra *builder*, *watch paths*, cron ni política de reinicio (NO VERIFICADO que existan). | Evaluarlo después del primer despliegue (decisión del usuario). |
| **Imagen de la base** | Plantilla «PostGIS» de Railway (`postgis/postgis:16-master`, SSL con certificado *snakeoil*) | Un clic, `PGDATA` ya resuelto. | Etiqueta `master`, distinta de la de desarrollo y de los IT. | No. |
| | `postgis/postgis:16-3.4` como servicio de imagen + volumen | La misma versión que `docker-compose.yml` y que la BD de los IT. | Hay que fijar `PGDATA` a mano. | **Sí** (decisión del usuario). |
| **Respaldo** | Respaldos de volumen de Railway (diario 6 días, semanal 27, mensual 89; [docs.railway.com/reference/backups](https://docs.railway.com/reference/backups)) | Sin código. | En qué plan están: NO VERIFICADO (respuestas de la comunidad dicen Pro); se borran con el volumen y solo se restauran en el mismo proyecto. | Complemento si el plan los incluye. |
| | PITR de Railway (pgBackRest) | Recuperación a un instante. | Requiere una imagen con pgBackRest (el ejemplo es `postgres-ssl:16`); con `postgis/postgis`, NO VERIFICADO y probablemente no. | No. |
| | Cron `pg_dump` a un bucket R2 propio (la guía oficial de Railway recomienda este patrón; [guía](https://docs.railway.com/guides/postgres-backups-restores)) | Independiente de Railway; restaurable en cualquier PostgreSQL 16 + PostGIS, incluido el `docker compose` local. | Un servicio más (minutos de CPU al día). | **Sí, obligatorio.** |
| **Despliegues de vista previa (Vercel)** | Activados | Ver cada PR desplegado. | Cada preview tiene otro origen (`<proyecto>-<hash>-<equipo>.vercel.app`): el CORS del API, que hoy usa orígenes exactos (`setAllowedOrigins`), los rechaza; y apuntarían a la base de producción. | **Desactivados** (solo `main`). |
| **Swagger en producción** | Público | Útil para mostrar el API al jurado. | Superficie innecesaria. | Apagado por defecto, activable con una variable (DEP-02). |

## Variables de entorno por servicio

Solo nombres y origen; **ningún valor secreto va al repositorio ni a este documento**. Las marcadas «nueva» las crea el paquete indicado.

### Railway · `backend`

| Variable | Valor u origen | Secreta | Paquete |
|---|---|---|---|
| `SPRING_PROFILES_ACTIVE` | `prod` (la imagen ya lo fija con `ENV`, DEP-03; se repite en Railway para que se vea en el panel) | no | DEP-02 (nueva) |
| `PORT` | la inyecta Railway; el perfil `prod` usa `server.port=${PORT:8080}` | no | DEP-02 |
| `DB_URL` | `jdbc:postgresql://${{postgis.RAILWAY_PRIVATE_DOMAIN}}:5432/${{postgis.POSTGRES_DB}}` (variables de referencia de Railway) | no | ya existe (perfil `dev`) |
| `DB_USERNAME` | `${{postgis.POSTGRES_USER}}` | no | ya existe |
| `DB_PASSWORD` | `${{postgis.POSTGRES_PASSWORD}}` | **sí** (referencia) | ya existe |
| `JWT_SECRET` | generado con `openssl rand -base64 48` | **sí** | DEP-01 |
| `JWT_EXPIRATION_MINUTES` | `120` | no | ya existe |
| `CORS_ALLOWED_ORIGINS` | `https://<proyecto>.vercel.app` (y el dominio propio, si lo hay) | no | ya existe |
| `NOTIF_FROM` | `Ciudad Viva <no-reply@<dominio verificado>>` o el remitente verificado en Brevo | no | ya existe |
| `CORREO_TIPO` | `brevo` o `resend` (`smtp` en local) | no | DEP-08 (nueva) |
| `CORREO_API_KEY` | clave del proveedor de correo | **sí** | DEP-08 (nueva) |
| `FOTOS_ALMACEN` | `s3` (`local` en desarrollo) → `app.storage.tipo` | no | DEP-12 (nueva) |
| `FOTOS_S3_ENDPOINT` | `https://<ACCOUNT_ID>.r2.cloudflarestorage.com` | no | DEP-12 (nueva) |
| `FOTOS_S3_REGION` | `auto` (R2 la ignora, pero el SDK la exige) | no | DEP-12 (nueva) |
| `FOTOS_S3_BUCKET_REPORTES`, `FOTOS_S3_BUCKET_PERFILES` | nombres de los buckets | no | DEP-12 (nueva) |
| `FOTOS_S3_ACCESS_KEY_ID`, `FOTOS_S3_SECRET_ACCESS_KEY` | token R2 con *Object Read & Write* limitado a esos dos buckets | **sí** | DEP-12 (nueva) |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | `npx web-push generate-vapid-keys` (un par propio de producción, distinto del de desarrollo) | la privada **sí** | ya existe |
| `VAPID_SUBJECT` | `mailto:<correo de contacto real>` | no | ya existe |
| `ADMIN_INICIAL_EMAIL` | correo **sin cuenta** del primer ADMIN; el seeder lo crea solo si la base no tiene ningún ADMIN. Se borra después del primer arranque. *Ajuste del 22/10, decisión del usuario: antes decía «cuenta ya registrada que pasa a ADMIN»; ver DEP-04.* | no (dato personal) | DEP-04 (nueva) |
| `ADMIN_INICIAL_PASSWORD` | contraseña inicial de ese ADMIN: 12 caracteres o más y 72 bytes como máximo (BCrypt). Se borra después del primer arranque. *Ajuste del 22/10.* | **sí** | DEP-04 (nueva) |
| `ADMIN_INICIAL_NOMBRE` | opcional: nombre completo del ADMIN («Administrador» si falta). *Ajuste del 22/10.* | no | DEP-04 (nueva) |
| `SPRINGDOC_HABILITADO` | `false` (por defecto) | no | DEP-02 (nueva) |
| `JAVA_TOOL_OPTIONS` | `-Xms256m -Xmx512m -XX:+UseSerialGC -XX:+ExitOnOutOfMemoryError` | no | DEP-03 |
| `LEGAL_VERSION_TERMINOS`, `PUSH_*`, `ASYNC_*` | valores por defecto de `application.yml` | no | ya existen |

**Por qué fijar el heap:** Railway cobra la RAM que se usa, y en Hobby un servicio puede llegar a 48 GB ([docs.railway.com/reference/pricing/plans](https://docs.railway.com/reference/pricing/plans)). La JVM calcula su heap máximo sobre el límite del contenedor, así que sin `-Xmx` puede crecer mucho más de lo que la app necesita. 512 MB alcanzan solo si el saneado de fotos (DEP-12) decodifica submuestreado a 2048 px y limita los saneados simultáneos: el criterio de DEP-12 lo prueba con `-Xmx512m` y subidas grandes en paralelo.

### Railway · `postgis`

| Variable | Valor u origen | Secreta |
|---|---|---|
| `POSTGRES_DB` | `viasegura` (identificador técnico conservado) | no |
| `POSTGRES_USER` | `viasegura` | no |
| `POSTGRES_PASSWORD` | generada (32+ caracteres aleatorios) | **sí** |
| `PGDATA` | `/var/lib/postgresql/data/pgdata` | no |
| Volumen | montado en `/var/lib/postgresql/data` | — |

### Railway · `respaldo-bd` (plantilla «Postgres S3 Backups»)

| Variable | Valor u origen | Secreta |
|---|---|---|
| `BACKUP_DATABASE_URL` | `postgresql://${{postgis.POSTGRES_USER}}:${{postgis.POSTGRES_PASSWORD}}@${{postgis.RAILWAY_PRIVATE_DOMAIN}}:5432/${{postgis.POSTGRES_DB}}` | **sí** (referencia) |
| `AWS_S3_ENDPOINT` | el mismo endpoint de R2 | no |
| `AWS_S3_BUCKET`, `AWS_S3_REGION` | bucket de respaldos, `auto` | no |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | **otro** token R2, limitado al bucket de respaldos | **sí** |
| `SINGLE_SHOT_MODE` | `true` (el horario lo pone el cron de Railway) | no |
| `PG_VERSION` | `16` (el cliente `pg_dump` debe ser de la misma versión mayor que el servidor o mayor) | no |
| `BACKUP_FILE_PREFIX` | `ciudadviva` | no |

### Vercel · proyecto de la PWA

| Variable | Entorno | Valor |
|---|---|---|
| `NEXT_PUBLIC_API_BASE_URL` | Production | `https://<backend>.up.railway.app` (o `https://api.<dominio>`). Se hornea al construir: cambiarla exige redesplegar ([nextjs.org, Environment Variables](https://nextjs.org/docs/app/guides/environment-variables), 25/08/2026). |

Versión de Node: `engines.node` de `frontend/package.json` (DEP-06), que tiene prioridad sobre la del panel. Vercel ofrece 24.x (por defecto) y 22.x; Node 20 quedó deprecado el 01/10/2026 ([vercel.com/docs, Node.js versions](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions)).

### GitHub Actions

Ninguna para la CI de DEP-07 (usa una base PostGIS de servicio con credenciales de prueba). Ningún secreto de despliegue: despliegan las integraciones de Vercel y Railway.

## Costos estimados (mensuales, US$, consultados el 21/10/2026)

| Servicio | Plan | Estimado | Supuestos y fuente |
|---|---|---|---|
| Railway | Hobby: US$ 5/mes que incluyen US$ 5 de uso | **≈ 9–10** | `backend` 0,5 GB de RAM y ~0,05 vCPU promedio; `postgis` 0,25 GB y ~0,02 vCPU; volumen 1 GB; ~5 GB de egreso. Precios: RAM US$ 10/GB-mes, CPU US$ 20/vCPU-mes, volumen US$ 0,15/GB-mes, egreso US$ 0,05/GB ([railway.com/pricing](https://railway.com/pricing)). El cron de respaldo usa minutos al día. El plan Free (0,5 GB por servicio y US$ 1 de crédito) no alcanza. |
| Vercel | Hobby | **0** | Uso personal no comercial; 100 GB de transferencia y 1 M de solicitudes al mes ([vercel.com/docs/plans/hobby](https://vercel.com/docs/plans/hobby), 14/09/2026). El repo `TP202620041/tesis` es **público**, y Hobby puede desplegar repos públicos de organizaciones; los privados no ([vercel.com/docs/git](https://vercel.com/docs/git), 18/09/2026). |
| Cloudflare R2 | Capa gratuita | **0** | 10 GB-mes, 1 M de operaciones clase A y 10 M de clase B gratis; egreso gratis ([developers.cloudflare.com/r2/pricing](https://developers.cloudflare.com/r2/pricing/), 01/10/2026). Fotos y respaldos de un MVP caben con holgura. Hay que activar R2 en la cuenta (*checkout*; que pida tarjeta: NO VERIFICADO). |
| Correo | Brevo Free o Resend Free | **0** | Brevo 300/día; Resend 100/día y 3.000/mes (detalle en la propuesta de correo). |
| Dominio (opcional) | — | ≈ 1 (≈ 10–15 al año por un `.com`; un `.pe` cuesta más) | NO VERIFICADO: cotizar al decidir. |
| Servicio de inferencia (S7, futuro) | Railway | + ≈ 5–10 | 0,5–1 GB de RAM según el modelo (ver la propuesta de ML). |
| **Total** | | **≈ US$ 10/mes** sin dominio ni inferencia | |

Riesgos de costo: la RAM de la JVM sin `-Xmx` (arriba), y que Vercel Hobby bloquea durante 30 días el recurso que excede su límite. Conviene fijar una alerta o límite de uso en Railway (si el panel lo permite en Hobby: NO VERIFICADO).

## Respaldos de la base de datos

- **Objetivo:** RPO de 24 h (se pierde como máximo un día) y RTO de ~1 h (restaurar a mano siguiendo el runbook). El reglamento de la Ley N.° 29733 pide respaldos **al menos semanales** (DS 016-2024-JUS, art. 51); el diario lo cumple.
- **Mecanismo:** el servicio cron `respaldo-bd` corre `pg_dump` por la red privada y sube el volcado a un bucket R2 **separado** (`…-respaldos`), con su propio token limitado a ese bucket. Una regla de ciclo de vida del bucket borra los volcados de más de 30 días ([R2, Object lifecycles](https://developers.cloudflare.com/r2/buckets/object-lifecycles/), 21/04/2026). Si el plan de Railway incluye respaldos del volumen, se activan además (diario y semanal).
- **Prueba de restauración:** una vez al mes, y antes de cada release, se baja el último volcado, se restaura en el PostGIS local de `docker compose` y se arranca la app contra esa copia (Flyway en `validate` lo confirma). Pasos en `docs/despliegue.md` §8.
- **Fotos:** R2 no tiene versionado de objetos (NO VERIFICADO); la API nunca borra fotos de reporte. Para el MVP se acepta el riesgo; una copia semanal del bucket con `rclone` queda como mejora.
- **Lo que no se respalda:** los logs de Railway (retención corta). Ver riesgo legal 2.4.

## Dominio propio (opcional) y sus efectos

Hoy el MVP funciona con `*.vercel.app` y `*.up.railway.app`. `viasegura.pe` aparece en valores por defecto (`NOTIF_FROM`, `VAPID_SUBJECT` del `.env.example`), pero no consta que el proyecto sea dueño de ese dominio: **no se usa como remitente ni contacto hasta confirmarlo.**

| Efecto | Qué cambia si se adopta un dominio |
|---|---|
| **Origen de la PWA** | Push, Service Worker, `localStorage` (el JWT) e IndexedDB (la cola offline, US-06) **son por origen**. Mudar la PWA de `*.vercel.app` a `app.<dominio>` obliga a cada usuario a reinstalarla, volver a iniciar sesión y volver a suscribirse a push, y los reportes que estaban en la cola offline del origen viejo no pasan al nuevo. **Por eso el dominio se decide antes de invitar usuarios reales** (o se acepta quedarse en `*.vercel.app`). |
| **CORS** | `CORS_ALLOWED_ORIGINS` suma el origen nuevo; el viejo se mantiene durante la transición. |
| **CSP y build** | Si el API pasa a `api.<dominio>`, cambia `NEXT_PUBLIC_API_BASE_URL` y hay que reconstruir la PWA (la CSP se arma con ella). Railway admite 2 dominios propios por servicio en Hobby, con CNAME + TXT de verificación y TLS automático. |
| **VAPID** | Las claves no dependen del dominio: **no rotarlas** al mudar (rotarlas invalida todas las suscripciones). `VAPID_SUBJECT` pasa a `mailto:` del dominio. |
| **Remitente de correo** | Con dominio propio se verifican SPF, DKIM y DMARC, y se puede usar Resend o Brevo con remitente propio. Sin dominio, solo Brevo funciona y reescribe el remitente (propuesta de correo). |
| **R2 y CDN futura** | Servir fotos desde un dominio propio exige que el dominio sea una zona de Cloudflare en la misma cuenta. Si se compra, conviene poner el DNS en Cloudflare desde el principio. |

## Riesgos

1. **Contrato del API y Service Worker viejo.** El SW usa `skipWaiting` + `clientsClaim` (`frontend/src/pwa/sw.ts`): la versión nueva toma el control al instante, pero una pestaña abierta conserva el JS viejo hasta recargar. Vercel *Skew Protection* (que mantiene vivos los assets de la versión anterior) **solo existe en Pro y Enterprise** ([vercel.com/docs/skew-protection](https://vercel.com/docs/skew-protection), 16/09/2026). Mitigación:
   - el backend despliega primero y es **compatible hacia atrás durante una versión** (cambios aditivos; un campo nuevo obligatorio se valida después de resolver la `Idempotency-Key`, como hizo NC-02);
   - la cola offline (US-06) puede reenviar reportes armados por una versión vieja: cada cambio de `POST /api/reportes` tiene que aceptar lo que mandaba la versión anterior o responder un error que la PWA sepa mostrar;
   - un error de carga de *chunk* en la PWA se resuelve recargando la página (no hay código que lo haga hoy).
2. **Ley N.° 29733 y su reglamento (DS 016-2024-JUS, vigente desde el 31/03/2025).** Lista para revisar con un asesor; no es asesoría legal. Fuentes en `2026-10-21-decisiones-pendientes.md` §7.
   1. **Inscribir el banco de datos** en el Registro Nacional (en línea en el SIPDP; gratuita y de aprobación automática) **antes de abrir a usuarios reales**. El mismo formulario comunica el **flujo transfronterizo** (Railway y Resend en EE. UU., Vercel, Cloudflare, Brevo en la UE), que es obligatorio comunicar (art. 21.2). No hay excepción académica: la única es el uso doméstico.
   2. **Aviso de privacidad:** los `[COMPLETAR]` de `project-context/legal/terminos-y-privacidad-v1.md` (titular, domicilio, correo de contacto, plazos de conservación) y la §4 con los proveedores reales y sus países. Debe informar las transferencias internacionales y que las fotos se analizan automáticamente para sugerir una categoría (cuando exista NC-04).
   3. **Edad:** de 14 a 17 años pueden consentir; los menores de 14 necesitan a sus padres (arts. 22 y 25). El registro no pregunta la edad: hay que agregar al menos una declaración.
   4. **Seguridad:** el reglamento pide registros de acceso conservados **2 años** para plataformas digitales (art. 46), un documento de seguridad (art. 47) y respaldos semanales (art. 51). Los logs de Railway no duran tanto. Confirmar con el asesor si aplica y cómo cumplirlo.
   5. **Incidentes:** si se filtran datos, aviso a la ANPD y a los afectados en **48 h** (art. 34). El runbook incluye el procedimiento mínimo.
   6. **Fotos con personas o placas:** la §10 de los términos traslada la responsabilidad al ciudadano y el reglamento cuenta las imágenes como dato personal. Quitar el EXIF (DEP-12) evita publicar la ubicación del teléfono y el modelo del dispositivo; difuminar caras o placas queda fuera del MVP.
   7. **Oficial de Datos Personales:** probablemente no es obligatorio (menos de 10.000 titulares y sin datos sensibles, según la Directiva ODP de 12/2025). Confirmar.
3. **Costo variable** (ver Costos).
4. **Abuso sin límite de tasa.** No hay *rate limiting* en login, registro, recuperación de contraseña ni subida de fotos. El caso más barato de explotar es agotar la cuota diaria del proveedor de correo con `POST /api/auth/recuperar-password`; la propuesta de correo pone un tope por cuenta. Un limitador general (Bucket4j, o Cloudflare delante del API con dominio propio) queda fuera de v0.7.0.
5. **Una sola instancia.** Redesplegar `backend` no corta el servicio (Railway cambia de versión cuando el health check responde), pero redesplegar `postgis`, que tiene volumen, sí lo corta brevemente. Railway no vigila el health check después del despliegue ([docs.railway.com/reference/healthchecks](https://docs.railway.com/reference/healthchecks)): una caída posterior no se detecta sola.
6. **Configuración en el panel.** Sin *Config as Code*, lo que está en el panel de Railway y Vercel puede desviarse del runbook. Mitigación: el runbook es la fuente de verdad y DEP-10 lo comprueba en cada release.
7. **Datos de demostración en producción.** El script `backend/scripts/seed-datos-prueba.sql` inventa reportes en distritos reales; en producción falsearía el índice público de desempeño. No se corre en producción (decisión pendiente: cómo mostrar la demo al jurado).

## Paquetes de trabajo

| ID | Qué | Dueño | Depende de | Criterio de aceptación |
|---|---|---|---|---|
| **DEP-01** | Secreto JWT con falla temprana | backend-dev | — | `common/security/JwtService` no arranca si el secreto falta, está en blanco, decodifica a menos de 32 bytes o es el valor de desarrollo conocido. La única exención es el valor de desarrollo con `local` o `test` **activos explícitamente** (`Environment#getActiveProfiles()`); **nunca** por `spring.profiles.default`, que hoy es `local` y se aplicaría a un contenedor que arranca sin perfil. El mensaje del error nombra `JWT_SECRET` y nunca imprime el valor. El valor de desarrollo sale de `application.yml` (que queda `secret: ${JWT_SECRET}`, sin valor por defecto) y pasa a `application-local.yml` como `${JWT_SECRET:<valor de desarrollo>}` y a la configuración de los IT (que ya activan `test` con `@ActiveProfiles`). Para que `mvn spring-boot:run` siga funcionando sin variables, el `pom.xml` activa `local` de forma explícita con la propiedad `<spring-boot.run.profiles>local</spring-boot.run.profiles>` (como propiedad y no como `<configuration>` del plugin, para que `-Dspring-boot.run.profiles=dev` la pueda reemplazar), o se documenta `SPRING_PROFILES_ACTIVE=local` en los `CLAUDE.md` y el README. `backend/.env.example` deja `JWT_SECRET=` vacío con el comando para generarlo. Tests unitarios: los cuatro casos de rechazo, el valor de desarrollo aceptado con `local` activo y **rechazado** cuando `local` solo es el perfil por defecto; Failsafe `completed` igual; ArchUnit 0. |
| **DEP-02** | Perfil `prod`, actuator y timeouts SMTP | backend-dev | DEP-01 | `application-prod.yml`: `DB_*` sin valores por defecto, `server.port: ${PORT:8080}`, sin `show-sql`, logs INFO, `server.error.include-message: never`, `spring.flyway.baseline-on-migrate: false`, springdoc apagado salvo `SPRINGDOC_HABILITADO=true`. `spring-boot-starter-actuator` con solo `health` expuesto, `show-details: never` y `management.health.mail.enabled: false`. Timeouts JavaMail (conexión 5 s, lectura 5 s, escritura 5 s) en la configuración común. IT: `GET /actuator/health` → 200 sin token y sin detalles; `/actuator/env` no responde 200; con `prod` y `SPRINGDOC_HABILITADO` ausente, `/v3/api-docs` no responde 200. Arranque verificado contra una base vacía con `SPRING_PROFILES_ACTIVE=prod`. |
| **DEP-03** | `backend/Dockerfile` multi-etapa y `backend/.dockerignore` | backend-dev | DEP-02 | Etapa de build `maven:3.9-eclipse-temurin-21` (capa de dependencias aparte, `-DskipTests`: las pruebas corren en la CI); etapa final `eclipse-temurin:21-jre-noble` con usuario no root, `EXPOSE 8080`, **`ENV SPRING_PROFILES_ACTIVE=prod`** (un contenedor nunca arranca con el perfil `local` por defecto, aunque falte la variable en Railway) y `JAVA_TOOL_OPTIONS` por variable. `.dockerignore` excluye `target/`, `uploads/`, `.env`, `*.log` e IDE. `docker run` con las variables de `prod` contra el PostGIS local: health 200, `fc-list` devuelve al menos una fuente y la exportación a Excel (`GET /api/reportes/exportar`, formato XLSX, con un funcionario) responde 200. Imagen final de menos de 400 MB. **Sin `railway.toml`** (deprecado): la configuración de Railway va en el runbook. |
| **DEP-04** | `auth/infra/AdministradorInicialSeeder` | backend-dev | — | *Ajuste del 22/10, decisión del usuario: el seeder **crea** la cuenta en vez de promover una ya registrada, porque promover dependía de registrarla antes de definir la variable (el registro no verifica la propiedad del correo).* `ApplicationRunner` idempotente (después de los seeders de distritos y municipalidades) que lee `ADMIN_INICIAL_EMAIL`, `ADMIN_INICIAL_PASSWORD` y `ADMIN_INICIAL_NOMBRE`, sin valores por defecto y sin `@ConditionalOnProperty`. Sin correo, no hace nada. Si **ya hay algún ADMIN**, no hace nada (log `INFO`, sin repetir la contraseña), aunque el correo de la variable sea nuevo: los ADMIN siguientes se gestionan aparte y nunca se pisa la contraseña de un ADMIN. **Sin ningún ADMIN:** si el correo no tiene cuenta, crea un ADMIN activo con la contraseña hasheada por el `PasswordEncoder` (12 caracteres o más y 72 bytes como máximo; si no, la aplicación no arranca) y registra en el log solo el correo; si el correo ya tiene cuenta, la aplicación no arranca (**nunca promueve**). No registra consentimiento (el ADMIN acepta los términos en su primer inicio de sesión, D-12) y no usa una migración (el hash quedaría versionado). IT con cada caso, también con un ADMIN ya presente. El runbook pide borrar las variables después del primer arranque. |
| **DEP-05** | `backend/scripts/asignar-funcionario.sql` | backend-dev | — | Script de `psql` con variables (`-v email=… -v distrito=…`), en una transacción: falla con un mensaje claro si el correo no existe, si la cuenta es ADMIN o si el nombre del distrito no coincide con exactamente un `distrito`. Pone `rol = FUNCIONARIO_MUNICIPAL` y `distrito_id`, y muestra la fila resultante. Un modo para devolver la cuenta a CIUDADANO. Probado contra la BD local con los usuarios de `seed-datos-prueba.sql`. Si D-10 cambia la jurisdicción a `municipalidad_id`, el script se actualiza con esa tarea. |
| **DEP-06** | PWA mínima para producción | frontend-dev | — | `public/icons/icon-192.png` e `icon-512.png` con `purpose: any`, más variantes `maskable` y `apple-touch-icon` (provisionales hasta el S8). `frontend/.env.example` con `NEXT_PUBLIC_API_BASE_URL` y la excepción `!.env.example` en `.gitignore`. `engines.node` (`24.x`) en `package.json` y `.nvmrc`. Fuente: Geist servida sin descargarla de Google en el build (paquete `geist` con `next/font/local`), o constancia de que se mantiene `next/font/google`. DevTools › Application › Manifest sin errores; Android ofrece instalar con el icono; `npm run typecheck`, `npm test` y `npm run lint` en verde. |
| **DEP-07** | CI en GitHub Actions | arquitecto | DEP-06 (por `.nvmrc`) | `.github/workflows/ci.yml` en cada PR a `develop` y `main`: **backend** con un servicio `postgis/postgis:16-3.4`, JDK 21 y `mvn -B clean verify` con `TEST_DB_URL`, que falla si `failsafe-summary.xml` trae errores o fallos, o si `completed` es menor que el mínimo declarado en el workflow (309 hoy; la guarda de completitud de la memoria del proyecto); **frontend** con el Node de `.nvmrc`, `npm ci`, `typecheck`, `lint`, `npm test` y `npm run build`; **imagen** con `docker build backend/` cuando cambia `backend/**`. Una corrida verde en un PR y una roja con un test roto. El usuario decide si los marca como obligatorios en la protección de ramas. |
| **DEP-08** | Correo por API HTTP | backend-dev | DEP-02; decisión de proveedor | Ver `2026-10-21-correo-saliente-http.md`: `common/port/CorreoSaliente` con `SmtpCorreoAdapter` (local y tests) y el adaptador HTTP; los tres usos migrados; recuperación de contraseña y respuesta de ticket fuera de la transacción; 202 siempre; tope por cuenta. Ningún `JavaMailSender` fuera de `SmtpCorreoAdapter`. |
| **DEP-09** | Runbook | arquitecto + usuario | DEP-01..08, DEP-12 | `docs/despliegue.md` (entregado con esta propuesta) ejecutado de punta a punta en el primer despliegue real; lo que no coincida se corrige en la misma semana. Incluye una restauración de prueba del respaldo y una rotación de `JWT_SECRET`. |
| **DEP-10** | Prueba de humo en producción | qa-e2e | DEP-09 | Lista de `docs/despliegue.md` §7 corrida contra las URLs de producción después de cada despliegue de `main`, con informe por severidad: health, catálogos (43 distritos, categorías), registro con términos, reporte con foto (la URL pública de la foto responde 200 sin token y sin EXIF), foto de perfil solo para su dueño, CORS desde el origen de la PWA (y rechazo desde otro), cabecera CSP, `/sw.js`, manifest e iconos, correo de recuperación recibido, push en Android y en iPhone instalada, exportación a Excel, actuator y Swagger cerrados. |
| **DEP-11** | Manejadores 413, 405, 400 y 415, y registro de los 500 | backend-dev | — | `GlobalExceptionHandler`: `MaxUploadSizeExceededException` → 413 con «La foto supera el tamaño máximo de 10 MB»; `HttpRequestMethodNotSupportedException` → 405 (con `Allow`); `MissingServletRequestParameterException` y `MissingServletRequestPartException` → 400; `HttpMediaTypeNotSupportedException` → 415; el manejador genérico registra la excepción (ERROR, con ruta y sin cuerpo). IT por cada caso. Probado con un archivo de 11 MB y otro de 30 MB: el cliente recibe 413 y no un corte de conexión (ajustar `server.tomcat.max-swallow-size` si hace falta). Tarea de seguimiento para la PWA: rechazar en el cliente fotos de más de 10 MB antes de enviarlas o encolarlas. |
| **DEP-12** | Fotos en R2 y sin EXIF | backend-dev | DEP-02; buckets y token creados por el usuario | Ver `2026-10-21-fotos-r2.md`: `S3FotoStorageService` con `app.storage.tipo=s3`, saneado de imágenes detrás de `common/port/SaneadorDeImagen` (EXIF fuera, orientación aplicada, decodificación submuestreada a 2048 px y semáforo de saneados simultáneos), mismas URLs, IT contra un emulador S3 activado por variable en la CI (Adobe S3Mock: **MinIO ya no se distribuye ni se mantiene**). **Memoria:** con la imagen de DEP-03 y `-Xmx512m`, 8 subidas simultáneas de fotos de 10 MB (24–40 MP) terminan en 201 o en 503 «ocupado», sin ningún 500 ni `OutOfMemoryError`; el pico de heap queda anotado en el PR. |

**Orden sugerido (un sprint, v0.7.0):** el backend en serie, porque comparte la BD de test y el almacén de ArchUnit: DEP-01 → DEP-02 → DEP-11 → DEP-03 → DEP-04 → DEP-05 → DEP-08 → DEP-12. En paralelo: DEP-06 (frontend) y después DEP-07 (arquitecto). El usuario crea las cuentas y los secretos (runbook §1–§4) mientras tanto. Al final: primer despliegue con el runbook (DEP-09), prueba de humo (DEP-10) y release.

## Impacto

- **Capas:** sin módulos nuevos. `common/infra` suma el adaptador S3 y el de correo HTTP; `common/port` suma `CorreoSaliente` y `SaneadorDeImagen`; `auth/infra` suma el seeder; `auth` y `soporte` suman `event/` y `listener/` para el correo. Nada fuera de §4.1.
- **Contrato del API:** sin cambios de rutas ni DTO. Cambian códigos de error que hoy son 500 por error del cliente (413, 405, 400, 415): mejora compatible, la PWA ya muestra el `message`.
- **Migraciones:** ninguna.
- **Tests:** suben Surefire y Failsafe (DEP-01, 02, 04, 08, 11, 12); la CI corre la suite completa en cada PR.
- **Normas:** si se acepta, la sesión de raíz registra la decisión (D-15) en ARCHITECTURE.md §9 y, con la propuesta de correo, mueve `CorreoSaliente` a `common` en §4.1 y §4.3.

## Recomendación

Aceptar la arquitectura como está descrita, con tres ajustes al encargo que salieron de la investigación: **sin `railway.toml`** (deprecado por Railway; la configuración queda en el runbook), **sin MinIO** (archivado; Adobe S3Mock para las pruebas S3) y **respaldo diario con `pg_dump` a R2** como mecanismo obligatorio. Abrir v0.7.0 como «MVP desplegado» con DEP-01..DEP-12, y no invitar usuarios reales hasta resolver el dominio y los pendientes legales de urgencia alta.

## Qué queda bloqueado mientras no se decida

- DEP-08 necesita el proveedor de correo y el dominio remitente.
- DEP-12 necesita los buckets y el token de R2 (cuenta de Cloudflare del usuario).
- DEP-04 necesita el correo del primer ADMIN.
- La salida a usuarios reales necesita la inscripción ante la ANPD y los `[COMPLETAR]` de los términos.
- DEP-01, 02, 03, 05, 06, 07 y 11 no dependen de ninguna decisión: pueden empezar ya.

## Decisión (2026-10-21)

El usuario aceptó desplegar el MVP en **Railway** (backend en contenedor y PostgreSQL con PostGIS) y **Vercel** (PWA), con las fotos en **Cloudflare R2** y el correo por API HTTP con **Resend** (ver `2026-10-21-correo-saliente-http.md`). Como Resend exige un dominio verificado, el dominio propio (decisión 3 del índice) pasa a ser requisito del despliegue con correo. La versión que sale con el despliegue es **v0.7.0**. Los paquetes DEP-01..DEP-12 se ejecutan según esta propuesta.

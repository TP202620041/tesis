# Despliegue de Ciudad Viva (runbook)

> Procedimiento para desplegar el MVP en **Railway** (API + PostGIS + respaldo), **Vercel** (PWA), **Cloudflare R2** (fotos y respaldos) y **Resend** (correo por HTTP). Diseño, opciones y fuentes: `project-context/decisions/propuestas/2026-10-21-despliegue-mvp.md` (aceptada el 21/10). Diagrama: `docs/arquitectura/c4-despliegue.md`.
>
> Versión 0.2 · 2026-10-25 · El primer despliegue (DEP-09) se hizo el 25/10 con v0.7.1, y v0.7.2 agrega `respaldo-bd` (§5.3). Lo que sigue marcado **(verificar)** se confirma con la prueba de humo (DEP-10) y se corrige aquí.

## 0. Antes de empezar

**Requisitos de código.** Este runbook despliega una versión de `main` que ya incluye DEP-01 (secreto JWT), DEP-02 (perfil `prod` y actuator), DEP-03 (`backend/Dockerfile`), DEP-04 (ADMIN inicial), DEP-05 (script de funcionarios), DEP-06 (iconos y Node), DEP-08 (correo HTTP), DEP-11 (errores 413/405) y DEP-12 (fotos en R2). Sin DEP-12, cada despliegue del API borra las fotos.

**Reglas.**

- **Ningún secreto se escribe en el repo, en un issue, en un PR ni en un chat.** Se generan en la máquina del responsable, se guardan en un gestor de contraseñas y se pegan directamente en el panel de Railway o Vercel.
- Los nombres de servicio de este documento (`backend`, `postgis`, `respaldo-bd`) se usan en las variables de referencia de Railway (`${{postgis.…}}`): si se cambian, hay que cambiar también las referencias.
- Railway deprecó `railway.toml` (*Config as Code*): **la configuración vive en el panel** y este documento es su fuente de verdad. Si se cambia algo en el panel, se cambia aquí en el mismo día.

**Herramientas locales.**

| Herramienta | Para qué |
|---|---|
| `openssl` | Generar secretos. |
| Node.js 24 (`npx`) | Generar las claves VAPID (`npx web-push generate-vapid-keys`). |
| [Railway CLI](https://docs.railway.com/cli) | `railway connect` (psql por túnel SSH, sin abrir la base a internet), `railway logs`, `railway cron run`. |
| `psql` y `pg_restore` 16 | Asignar funcionarios y restaurar respaldos. |
| Docker | Probar la restauración en el PostGIS local. |
| `curl` | Verificar cada paso. |

En los comandos, `$API` es la URL pública del API y `$PWA` la de la PWA. Las fijó el usuario el 25/10 (decisión 3b):

| Servicio | URL | Dónde | Nota |
|---|---|---|---|
| PWA | `$PWA` = `https://ciudadviva.app` | Vercel | Es el **único origen** de la PWA. `https://www.ciudadviva.app` redirige a la raíz. |
| API | `$API` = `https://api.ciudadviva.app` | Railway (`backend`) | |
| Fotos | `fotos.ciudadviva.app` | — | **Reservado** para un dominio propio de R2. Hoy no se crea nada. |

El origen de la PWA no debe cambiar después de abrir a usuarios: push, la sesión y la cola offline son por origen. Las URLs que dan Vercel (`*.vercel.app`) y Railway (`*.up.railway.app`) siguen existiendo; sirven para depurar, no para los usuarios.

## 1. Cuentas

| Cuenta | Plan | Quién | Nota |
|---|---|---|---|
| GitHub (`TP202620041/tesis`) | — | ya existe | El repo es público: Vercel Hobby puede desplegarlo. Si pasa a privado, Hobby ya no puede (fuente en la propuesta). |
| Railway | **Hobby** (US$ 5/mes con US$ 5 de uso) | dueño del proyecto | El plan Free no alcanza (0,5 GB por servicio). Decidido el 25/10: la cuenta del usuario ya está en Hobby. |
| Vercel | **Hobby** | dueño del proyecto, con login de GitHub | Uso no comercial. |
| Cloudflare | Free, con **R2 activado** | dueño del proyecto | Activar R2 pide completar un *checkout* **con tarjeta** (confirmado el 25/10). El dominio `ciudadviva.app` también está aquí (§3). |
| Resend | Free | dueño del proyecto | 100 correos al día y 3.000 al mes. Exige un dominio propio verificado: `ciudadviva.app`, verificado el 25/10 (§3). La API key de envío ya existe (25/10): el usuario la pega directo en Railway como `CORREO_API_KEY`. |

## 2. Cloudflare R2

1. **Buckets** (R2 › Create bucket), los tres **privados**, *location hint* **Eastern North America (`enam`)**, sin jurisdicción:
   - `ciudadviva-fotos-reportes`
   - `ciudadviva-fotos-perfiles`
   - `ciudadviva-respaldos`

   Fijar el *location hint* a mano en el panel. Creados por la API o el conector sin indicarlo, los buckets de prueba quedaron en ENAM (25/10), pero producción no debe depender de ese valor por defecto.
2. **Ciclo de vida de los respaldos:** en `ciudadviva-respaldos` › Settings › Object Lifecycle Rules › Add rule: borrar objetos de más de **30 días**.
3. **Tokens** desde la página de R2: R2 object storage › Overview › Account Details › API Tokens › Manage › **«Create Account API token»**.
   - **Token de cuenta, no de usuario:** sobrevive a los cambios de miembros de la cuenta ([tokens de cuenta](https://developers.cloudflare.com/fundamentals/api/get-started/account-owned-tokens/)). Crearlo desde la página de R2, que muestra directamente el *Access Key ID* y el *Secret Access Key*; la página general de tokens de cuenta solo da el valor del token.
   - **Permiso:** **Object Read & Write**, limitado a buckets concretos:
     - token **fotos**: solo `ciudadviva-fotos-reportes` y `ciudadviva-fotos-perfiles`;
     - token **respaldos**: solo `ciudadviva-respaldos`.
   - **Sin fecha de expiración:** un vencimiento corta las subidas de fotos y los respaldos sin aviso. Se rotan a mano (§9).

   Cada token muestra el *Access Key ID* y el *Secret Access Key* **una sola vez**: guardarlos en el gestor de contraseñas.
4. Anotar el **endpoint S3**: `https://<ACCOUNT_ID>.r2.cloudflarestorage.com` (R2 › Overview).

**Verificar:** los tres buckets aparecen como privados (sin `r2.dev` público ni dominio conectado).

## 3. Correo

**Decisión del usuario (21/10): Resend** (`project-context/decisions/propuestas/2026-10-21-correo-saliente-http.md`). El backend envía por su API HTTP (`CORREO_TIPO=resend`, `ResendCorreoAdapter`), porque el plan Hobby de Railway bloquea el SMTP saliente. Detalle del adaptador: `backend/README.md`, «Correo saliente (DEP-08)».

**Dominio del proyecto (25/10): `ciudadviva.app`**, en Cloudflare Registrar. Sus DNS están en la misma cuenta de Cloudflare que R2.
- **Solo HTTPS:** por ser `.app`, los navegadores solo lo abren por HTTPS (HSTS precargado en todo el dominio). Vercel, Railway y los túneles con nombre emiten el certificado solos.
- **Correo corporativo con Cloudflare Email Routing** (activo desde el 25/10, comprobado en el DNS público):
  - **Direcciones:** `contacto@`, `soporte@` y `dmarc@` se reenvían a la bandeja del equipo. El *catch-all* está desactivado: cualquier otra dirección rebota, incluida `no-reply@`, que solo envía. Esto es lo esperado.
  - **Registros que Cloudflare crea solo:** tres `MX` en la raíz (`route1`, `route2` y `route3.mx.cloudflare.net`), el SPF de la raíz (`v=spf1 include:_spf.mx.cloudflare.net ~all`) y **su propio DKIM** (`TXT` en `cf2024-1._domainkey`).
  - **Verificación del destino:** si el destino es el correo de la propia cuenta de Cloudflare, queda verificado en el acto. Con otra dirección llega un correo de verificación, y hasta confirmarlo no se pueden crear las reglas.
  - **Por API:** `POST /zones/{id}/email/routing/dns` con `name` sirve solo para subdominios; para la raíz se envía el cuerpo vacío.
- **Convivencia con Resend:** Resend usa el subdominio `send` y `resend._domainkey`. En la zona quedan dos DKIM, uno de Cloudflare y otro de Resend, y no chocan.
- **DMARC:** hay **un solo** registro para todo el dominio: `TXT` en `_dmarc` con `v=DMARC1; p=none; rua=mailto:dmarc@ciudadviva.app` (creado el 25/10). Endurecer a `p=quarantine` cuando los informes muestren que todo lo legítimo pasa.
- **DNSSEC:** activo desde el 25/10. Cloudflare publicó el `DS` en el registro de `.app` en unos 6 minutos, y la consulta a `1.1.1.1` devuelve `AD=true`.
- **Registros web:** el de la raíz (PWA, Vercel), el de `www` y el de `api` (Railway) **todavía no existen**. Se crean en el primer despliegue (§5.2 y §6) con el destino que indique cada plataforma. Conviven con el `MX` y el SPF de Email Routing en la raíz.
- **Hecho el 25/10:** la API key de envío (paso 2). La creó el usuario y la pega él en Railway.
- **Configuración TLS de la zona:** SSL/TLS = **Full** (no strict) con `ssl_automatic_mode = custom`, así que Cloudflare no la pasa sola a strict. Universal SSL está activo. TLS mínimo **1.2** desde el 25/10 (antes 1.0) y TLS 1.3 encendido. Solo afecta a los registros con proxy, es decir, a `api`. Un dominio propio de R2 (`fotos.`, reservado) configura su TLS mínimo en el bucket.

1. **Dominio** (Domains › Add Domain): **hecho el 25/10**; quedó «Verified» unos 6 minutos después de cargar los registros.
   - **Configuración:** región **`us-east-1`**, la misma que Railway. **No se puede cambiar después de crear el dominio.** Es de solo envío (recibir lo hace Email Routing), con TLS en modo *opportunistic*, el valor por defecto.
   - **Registros que pidió Resend (cuatro)**, cargados en el DNS de Cloudflare:
     - **DKIM:** `TXT` en `resend._domainkey`;
     - **SPF:** `MX` en `send` (`feedback-smtp.us-east-1.amazonses.com`, prioridad 10) y `TXT` en `send` (`v=spf1 include:amazonses.com ~all`). No chocan con el `MX` de Email Routing en la raíz;
     - **`CNAME` en `rsend`** → `send.forge.rmta.net`, **sin proxy** (nube gris);
     - **DMARC:** ya existe (el de arriba). No crear otro.
   - **Sin dominio verificado**, Resend solo entrega al correo del dueño de la cuenta (desde `onboarding@resend.dev`) y responde 403 a cualquier otro destinatario. El despliegue puede salir así, con el correo limitado a esa dirección: cada envío rechazado queda como un `WARN` en el log del backend, y la recuperación de contraseña sigue respondiendo 202.
2. **Clave** (API Keys › Create API Key): nombre `ciudadviva-backend`, permiso **Sending access** (solo envía) y, en *Domain*, **solo el dominio verificado**. Resend la muestra una sola vez: al gestor de contraseñas. Es `CORREO_API_KEY` (§5.2).
3. **Remitente:** `NOTIF_FROM=Ciudad Viva <no-reply@ciudadviva.app>` (§5.2).

**Verificar** (desde la máquina local, con la clave en una variable de la terminal y nunca escrita en un archivo):

```bash
curl -s -w "\n%{http_code}\n" https://api.resend.com/emails \
  -H "Authorization: Bearer $CORREO_API_KEY" \
  -H "Content-Type: application/json" \
  -H "User-Agent: CiudadViva-despliegue" \
  -d '{"from":"Ciudad Viva <no-reply@ciudadviva.app>","to":["<tu correo>"],"subject":"Prueba Ciudad Viva","text":"Prueba de despliegue"}'
# 200 y {"id":"…"}, y el correo llega (revisar también la carpeta de spam).
```

Si no es 200: `401`, la clave no es válida; `403`, el remitente no es del dominio verificado (o la clave está limitada a otro dominio), o falta la cabecera `User-Agent` (error 1010). El backend envía las mismas tres cabeceras.

> **Brevo** se comparó en la propuesta, pero el backend no tiene un `BrevoCorreoAdapter`: usarlo exigiría escribir antes ese adaptador de `CorreoSaliente` (y desactivar en Brevo el bloqueo de IP desconocidas, porque Railway Hobby no tiene IP de salida fija). Hoy `CORREO_TIPO=brevo` no arranca.

## 4. Secretos que se generan una vez

| Secreto | Cómo | Dónde va |
|---|---|---|
| `JWT_SECRET` | `openssl rand -base64 48` | `backend` |
| `POSTGRES_PASSWORD` | `openssl rand -base64 32 \| tr -d '/+='` | `postgis` |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | `npx web-push generate-vapid-keys` (**un par nuevo**, no el de desarrollo) | `backend` |

## 5. Railway

Crear un proyecto («Ciudad Viva», entorno `production`). **Hecho el 25/10**, a pedido del usuario, en su workspace y en plan Hobby. Región de cada servicio: **US East (Virginia)** (Settings › Deploy › Regions); no hay región en Sudamérica. **Fijarla siempre**: un servicio nuevo nace en `sfo` (oeste de EE. UU.).

**Después del primer despliegue (25/10, DEP-09),** el estado de abajo quedó atrás:
- **`backend`:** tiene el repo conectado en `main` y está desplegado con v0.7.1. Un disparador redespliega al fusionar en `main` y espera a que pase la CI («Wait for CI»).
  - Ese disparador exige que la app de Railway en GitHub tenga acceso a la organización `TP202620041`. Sin ese acceso, el primer despliegue funciona porque el repo es público, pero no hay despliegue automático.
- **`respaldo-bd`:** se crea con v0.7.2 (§5.3).

**Estado al 25/10** (lo hizo la sesión «dominio» a pedido del usuario):
- **`postgis`:** desplegado y sano (§5.1). Región `us-east4`, volumen de 5 GB.
- **`backend`:** configurado según §5.2 pero **sin el repo conectado** y sin despliegues.
  - Las variables `DB_*` son referencias a `postgis`. `JWT_SECRET` y un par VAPID **nuevo** se generaron y cargaron por stdin.
  - Faltan `CORREO_API_KEY` (la pega el usuario), `FOTOS_S3_ACCESS_KEY_ID` y `FOTOS_S3_SECRET_ACCESS_KEY` (falta R2 de producción) y `ADMIN_INICIAL_*`.
  - El dominio propio `api.ciudadviva.app` está creado en Railway; sus dos registros DNS los crea el usuario (§5.2, paso 5).
- **`respaldo-bd`:** todavía no; espera el bucket y el token de respaldos de R2.

**Si se usa la CLI de Railway desde Git Bash en Windows:**
- **Rutas:** las que empiezan con `/` se convierten en `C:/Program Files/Git/…` (pasó con `PGDATA`). Usar `MSYS_NO_PATHCONV=1` delante del comando, o el panel.
- **`railway variable delete`:** no acepta `--skip-deploys`, así que siempre redespliega.
- **Región:** `railway environment edit --service-config … deploy.multiRegionConfig '<json>'` no se aplicó; funcionó el parche JSON por stdin.
- **Secretos:** se cargan con `railway variable set --stdin`, para que nunca aparezcan en la terminal ni en una transcripción.

### 5.1 Servicio `postgis`

1. New › **Docker Image** › `postgis/postgis:16-3.4`. Renombrar el servicio a `postgis`.
2. **Volumen:** botón derecho sobre el servicio › Attach volume, montado en `/var/lib/postgresql/data`.
3. **Variables:**

   | Variable | Valor |
   |---|---|
   | `POSTGRES_DB` | `viasegura` |
   | `POSTGRES_USER` | `viasegura` |
   | `POSTGRES_PASSWORD` | el generado en §4 |
   | `PGDATA` | `/var/lib/postgresql/data/pgdata` |

   `PGDATA` apunta a un subdirectorio porque el volumen nuevo trae `lost+found` y `initdb` se niega a usar un directorio que no está vacío.
4. **Networking:** sin dominio público y **sin TCP Proxy**. La base solo se alcanza por la red privada (`postgis.railway.internal`).

**Verificar:**

```bash
railway logs --service postgis        # "database system is ready to accept connections"
railway connect postgis               # abre psql por túnel SSH (requiere psql local) (verificar con esta imagen)
#   viasegura=# SELECT name, default_version FROM pg_available_extensions WHERE name = 'postgis';
#   -> postgis | 3.4.x     (la extensión la crea Flyway V1 al arrancar el API)
```

### 5.2 Servicio `backend`

1. New › **GitHub Repo** › `TP202620041/tesis`. Renombrar a `backend`.
2. **Settings › Source:** rama `main`; *Root Directory* `backend`. Railway detecta `backend/Dockerfile` y construye con él.
3. **Settings › Build › Watch Paths:** `/backend/**` y `!/backend/scripts/respaldo-bd/**`. Las rutas parten de la raíz del repo aunque haya *Root Directory*. Así, un cambio en `frontend/`, en `docs/` o en el script de respaldos (§5.3) no redespliega el API.
4. **Settings › Deploy:** *Healthcheck Path* `/actuator/health` (el tiempo de espera por defecto, 300 s, alcanza); *Restart Policy* `On Failure`. Railway solo consulta el health check al desplegar, para cambiar de versión sin corte; no lo vigila después.
5. **Networking:**
   - **Generate Domain:** la URL `*.up.railway.app`, para depurar.
   - **Custom Domain** (Settings › Public Networking): `api.ciudadviva.app` (`$API`). Según [la documentación de Railway](https://docs.railway.com/networking/domains/working-with-domains), revisada por la sesión «dominio» el 25/10, se crean en Cloudflare **los dos registros** que muestra Railway:
     - el `CNAME` `api` → `<id>.up.railway.app`, **con proxy** (nube naranja);
     - el `TXT` de verificación, en `_railway-verify.api` con el valor que muestra Railway. Sin el `TXT`, el dominio responde 404 aunque el `CNAME` ya resuelva.

     El dominio se creó en Railway el 25/10 con **puerto destino 8080** (por eso `PORT=8080`). Los dos registros los crea el usuario en Cloudflare: el modo automático de Claude Code bloquea los cambios de DNS.

     En Cloudflare, SSL/TLS de la zona en **Full, NO «Full (strict)»**, porque el modo estricto no funciona con Railway; Universal SSL activado. Ese modo es de toda la zona, pero solo afecta a los registros con proxy: la raíz y `www` (Vercel, sin proxy), el correo y el DMARC no cambian. Cuando está bien, Railway muestra «Cloudflare proxy detected». Cloudflare presenta el certificado al público y Railway emite el suyo hacia el origen; por el HSTS de `.app`, el API no responde hasta tener certificado, así que hay que contar unos minutos.
   - **Límites del proxy (plan Free):** 100 MB por petición y 100 s de espera. Alcanzan de sobra (la foto se corta en 10 MB). El backend no limita por IP (no lee `X-Forwarded-For`), así que el doble proxy Cloudflare → Railway no rompe nada.
6. **Variables** (con «Add Reference» para las de `postgis`):

   | Variable | Valor |
   |---|---|
   | `SPRING_PROFILES_ACTIVE` | `prod` |
   | `DB_URL` | `jdbc:postgresql://${{postgis.RAILWAY_PRIVATE_DOMAIN}}:5432/${{postgis.POSTGRES_DB}}` |
   | `DB_USERNAME` | `${{postgis.POSTGRES_USER}}` |
   | `DB_PASSWORD` | `${{postgis.POSTGRES_PASSWORD}}` |
   | `JWT_SECRET` | §4 |
   | `JWT_EXPIRATION_MINUTES` | `120` |
   | `PORT` | `8080` (ver la nota debajo de la tabla) |
   | `CORS_ALLOWED_ORIGINS` | `https://ciudadviva.app`: solo la raíz, porque `www` redirige y no es un origen. Exacto, con `https://` y sin barra final. |
   | `NOTIF_FROM` | `Ciudad Viva <no-reply@ciudadviva.app>` (**obligatoria** en `prod` con cualquier tipo de correo) |
   | `CORREO_TIPO` | `resend` (decisión del 21/10). **Obligatoria** en `prod`: sin ella, o con un valor distinto de `smtp` o `resend`, la app no arranca. |
   | `CORREO_API_KEY` | §3 |
   | `FOTOS_ALMACEN` | `s3` |
   | `FOTOS_S3_ENDPOINT` | endpoint de §2 |
   | `FOTOS_S3_REGION` | `auto` |
   | `FOTOS_S3_BUCKET_REPORTES` | `ciudadviva-fotos-reportes` |
   | `FOTOS_S3_BUCKET_PERFILES` | `ciudadviva-fotos-perfiles` |
   | `FOTOS_S3_ACCESS_KEY_ID` / `FOTOS_S3_SECRET_ACCESS_KEY` | token **fotos** de §2 |
   | `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | §4 |
   | `VAPID_SUBJECT` | `mailto:contacto@ciudadviva.app` (activo en Email Routing, §3) |
   | `JAVA_TOOL_OPTIONS` | `-Xms256m -Xmx512m -XX:+UseSerialGC -XX:+ExitOnOutOfMemoryError` |
   | `SPRINGDOC_HABILITADO` | sin definir (Swagger apagado); `true` solo para una demo y después se quita |

   **`FOTOS_ALMACEN` es obligatoria en el perfil `prod`** (DEP-12): sin ella la app no arranca, para que un despliegue nunca guarde fotos en un disco que se borra. Con R2, `s3` y las variables `FOTOS_S3_*` de la tabla. Opcional: `FOTOS_SANEADO_MAX_CONCURRENTES` (2 por defecto).

   **Hecho el 25/10:** 6 tests contra R2 real, sin errores ni fallos. Después se borraron los buckets `ciudadviva-it-*`; borrar también su token. Repetir si cambia el adaptador o la versión del SDK de AWS.

   **Antes del primer despliegue con R2**, correr una vez `S3FotoStorageServiceIT` contra **dos buckets R2 de prueba** (no los de producción). En la CI ese IT corre contra S3Mock, y esta es la única prueba contra R2 real de la codificación de envío (*chunked encoding*) y de los *checksums*. Requisitos:
   - crear en R2 dos buckets de prueba (por ejemplo `ciudadviva-it-reportes` y `ciudadviva-it-perfiles`) y un token limitado a ellos (el token de R2 no puede crear buckets);
   - tener levantado el PostGIS local con la base `viasegura_test` (los IT la usan), como en `backend/CLAUDE.md`.

   ```bash
   cd backend
   FOTOS_S3_TEST_ENDPOINT=<endpoint R2> \
   FOTOS_S3_TEST_ACCESS_KEY_ID=<clave de prueba> FOTOS_S3_TEST_SECRET_ACCESS_KEY=<secreto de prueba> \
   FOTOS_S3_TEST_BUCKET_REPORTES=ciudadviva-it-reportes FOTOS_S3_TEST_BUCKET_PERFILES=ciudadviva-it-perfiles \
     mvn verify -Dit.test=S3FotoStorageServiceIT
   # Debe terminar con 6 tests ejecutados en failsafe-summary.xml (backend/README.md, sección de fotos).
   ```

   **Si se despliega sin R2** (fotos en disco):
   - `FOTOS_ALMACEN=local` y no se definen las variables `FOTOS_S3_*`;
   - se monta un *volume* en `/data` y se define `FOTOS_DIR=/data/fotos`;
   - se agrega `RAILWAY_RUN_UID=0`, porque el volumen se monta como root y la imagen corre sin privilegios (uid 10001). Esto hace correr el contenedor **como root**. Es temporal: se quita junto con el volumen cuando DEP-12 llega a producción (`backend/README.md`, «Configuración de producción»).

   **`PORT=8080`, explícito.** El perfil `prod` escucha en `${PORT:8080}` (`application-prod.yml`) y el dominio propio de Railway apunta al puerto 8080. Definir la variable evita que un `PORT` inyectado por Railway los desincronice.

   **Builder:** con *Root Directory* `backend`, Railway debería usar `backend/Dockerfile`. Al configurarlo por CLI, `build.builder=DOCKERFILE` no quedó guardado (25/10, siguió en RAILPACK). En el log del primer build, confirmar que construye con el Dockerfile.

   El heap de 512 MB está medido para el saneado de fotos de DEP-12 (decodificación submuestreada y como máximo 2 saneados simultáneos); si los logs muestran `OutOfMemoryError`, subir a `-Xmx768m` y avisar para revisar el límite de saneados. Los nombres de `FOTOS_S3_*` son los de DEP-12 (`backend/README.md`); los de `CORREO_*` los fija DEP-08: si cambian, se actualiza esta tabla.

**Verificar** (logs del primer despliegue y luego `curl`):

```bash
railway logs --service backend
#  - Flyway: "Successfully applied N migrations" en la primera corrida (todas las V*.sql; 18 en v0.7.0 y v0.7.1)
#  - DistritoSeeder: 43 distritos; MunicipalidadSeeder: 43 municipalidades
#  - "Started ViaSeguraApplication"; ninguna línea con "show-sql" ni DEBUG
curl -s $API/actuator/health                       # {"status":"UP"} y nada más
curl -s $API/api/distritos | grep -o '"id"' | wc -l   # 43
curl -s -o /dev/null -w "%{http_code}\n" $API/actuator/env         # distinto de 200
curl -s -o /dev/null -w "%{http_code}\n" $API/v3/api-docs          # distinto de 200 (Swagger apagado)
```

### 5.3 Servicio `respaldo-bd`

**Script propio del repo:** `backend/scripts/respaldo-bd/` (decisión del usuario, 25/10). Hace un `pg_dump` en formato custom, lo valida con `pg_restore --list` y lo sube a R2 con `curl --aws-sigv4`. El detalle y la verificación están en `backend/README.md`, «Respaldo diario de la base».

**Por qué no la plantilla:** la versión anterior de este runbook usaba la plantilla «Postgres S3 Backups» (`railwayapp-templates/postgres-s3-backups`), que quedó archivada. Su reemplazo oficial despliega código de un tercero con acceso a la base y además crea un bucket de Railway que no se usa.

1. New › **GitHub Repo** › `TP202620041/tesis`. Renombrar el servicio a `respaldo-bd` y fijar la región US East (Virginia) (§5).
2. **Settings › Source:**
   - **Rama y carpeta:** rama `main`; *Root Directory* `backend/scripts/respaldo-bd`. Railway construye con el `Dockerfile` de esa carpeta.
   - **Watch Paths:** `/backend/scripts/respaldo-bd/**`.
   - **En `backend`:** agregar `!/backend/scripts/respaldo-bd/**` a sus *Watch Paths*, para que un cambio del script no redespliegue el API.
3. **Variables:**

   | Variable | Valor |
   |---|---|
   | `BACKUP_DATABASE_URL` | `postgresql://${{postgis.POSTGRES_USER}}:${{postgis.POSTGRES_PASSWORD}}@${{postgis.RAILWAY_PRIVATE_DOMAIN}}:5432/${{postgis.POSTGRES_DB}}` |
   | `AWS_S3_ENDPOINT` | `${{backend.FOTOS_S3_ENDPOINT}}`: el endpoint de §2, por referencia |
   | `AWS_S3_REGION` | `auto` |
   | `AWS_S3_BUCKET` | `ciudadviva-respaldos` |
   | `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | token **respaldos** de §2 (los pega el usuario, §0) |
   | `BACKUP_FILE_PREFIX` | opcional; `ciudadviva` por defecto |

   **La URL lleva `POSTGRES_PASSWORD` sin codificar.** Funciona porque §4 la genera sin `/`, `+` ni `=`. Si se rota (§9), la nueva tiene que ser **solo alfanumérica**: un `/`, `@` o `%` rompe la URL, y libpq repite trozos de ella en el error del log.
4. **Settings › Deploy:**
   - **Cron Schedule:** `0 8 * * *`, que son las 08:00 UTC, las 03:00 en Lima. El cron de Railway corre en UTC, con un mínimo de 5 minutos entre corridas.
   - **Restart Policy:** *On Failure*, con **2** reintentos como máximo.
     - **Por qué se puede reintentar:** cada corrida crea un objeto con otro nombre, así que un reintento nunca pisa un respaldo bueno.
     - **Qué cubre:** un fallo pasajero de la red o de R2 que sobreviva a los 3 reintentos de `curl` no deja el día sin respaldo.
     - **Por qué no se cuelga:** el script corta solo, con 15 s para conectar a la base, 60 s de espera por un lock y 15 min para la subida. Un cuelgue haría que Railway saltara las corridas siguientes.
     - (verificar que Railway aplique la política a un servicio cron).
5. **Si falla, que se note:** Railway avisa por correo cuando un despliegue o una corrida falla. Comprobar que esas notificaciones estén activas en la cuenta del usuario (*Account › Notifications*; verificar el nombre exacto). Además, §8 pide revisar cada semana que el último objeto tenga menos de 24 h.

**Verificar la primera vez** (desde la PC del usuario, con la CLI enlazada al proyecto):
1. **Probar contra R2 antes de esperar al cron**, porque la prueba local con S3Mock no valida la firma SigV4:
   - con la variable `BACKUP_FILE_PREFIX=prueba`, correr `railway cron run --service respaldo-bd`;
   - si el objeto `prueba-….dump` aparece en `ciudadviva-respaldos`, quitar la variable y borrar el objeto.
2. **Resultado esperado:**
   - **En el log:** `Respaldo subido: ciudadviva-respaldos/<prefijo>-<fecha UTC>.dump (<bytes> bytes, sha256 …)`.
   - **Un 403 de R2:** muestra el XML del error, sin la clave. Lo normal es que el token «respaldos» no alcance a ese bucket.
   - **Si dice `could not translate host name "postgis.railway.internal"`:** es la resolución DNS de Alpine (musl) en la red privada. Agregar `ENABLE_ALPINE_PRIVATE_NETWORKING=true` o cambiar la imagen a `postgres:16-bookworm`.
   - **Formato:** `pg_dump` custom; se restaura con `pg_restore` (§8).

Si el plan de Railway incluye respaldos del volumen (en el servicio `postgis` › Backups), activar también el diario y el semanal (verificar disponibilidad en Hobby).

## 6. Vercel

1. Add New › Project › importar `TP202620041/tesis`.
2. **Root Directory:** `frontend`. Framework: Next.js (detectado). Build command: el de `package.json` (`npm run build`, que también compila el Service Worker). Node: lo fija `engines.node` (24.x).
3. **Environment Variables › Production:** `NEXT_PUBLIC_API_BASE_URL` = `https://api.ciudadviva.app` (sin barra final).
   - Se hornea en el build y en la CSP: `next.config.ts` la pone en `connect-src` y en `img-src`, así que las fotos que sirve el API también pasan.
   - Cambiarla exige redesplegar.
4. Deploy. La URL `*.vercel.app` queda para depurar.
5. **Settings › Domains:**
   - agregar `ciudadviva.app` como dominio de producción (`$PWA`);
   - agregar `www.ciudadviva.app` con **redirección permanente a la raíz**;
   - crear en el DNS de Cloudflare los registros que indique Vercel, los dos **sin proxy** (nube gris):
     - un **`A`** para el *apex* (`@`), con el valor que muestre Vercel (`vercel domains inspect`). Conviene un `A` y no un `CNAME` aplanado;
     - un `CNAME` para `www`.

     Con proxy naranja se han reportado «Invalid Configuration» y fallos al emitir el certificado ([integración de Vercel con Cloudflare](https://vercel.com/docs/integrations/cloudflare)). El `A` de la raíz convive con el `MX` y el SPF de Email Routing.

   Esperar a que Vercel emita los certificados: `.app` solo funciona con HTTPS.
6. **Settings › Git:** *Production Branch* `main`. *Ignored Build Step*: preset **«Only build production»** (sin previews: cada preview tendría otro origen, que el CORS del API rechaza, y usaría la base de producción).
7. Confirmar en Railway › `backend` › Variables que `CORS_ALLOWED_ORIGINS` = `https://ciudadviva.app` (§5.2).

**Verificar:**

```bash
curl -sI $PWA/ | grep -i content-security-policy     # contiene la URL de $API en connect-src e img-src
curl -s -o /dev/null -w "%{http_code}\n" $PWA/sw.js                  # 200 (lo genera Serwist después de next build)
curl -s -o /dev/null -w "%{http_code}\n" $PWA/manifest.webmanifest   # 200
curl -s -o /dev/null -w "%{http_code}\n" $PWA/icons/icon-192.png     # 200
# CORS: el origen de la PWA pasa; otro origen no
curl -s -o /dev/null -w "%{http_code}\n" -X OPTIONS $API/api/reportes \
  -H "Origin: $PWA" -H "Access-Control-Request-Method: POST"         # 200
curl -s -o /dev/null -w "%{http_code}\n" -X OPTIONS $API/api/reportes \
  -H "Origin: https://ejemplo.com" -H "Access-Control-Request-Method: POST"   # 403
```

## 7. Primer ADMIN, funcionarios y prueba de humo

### 7.1 ADMIN (DEP-04)

Diseño decidido por el usuario el 22/10: el seeder **crea** el ADMIN desde variables y **solo si la base no tiene ningún ADMIN**. Nunca promueve una cuenta existente. Detalle en `backend/README.md`, «Operación en producción».

1. **Antes del primer despliegue** del backend, en Railway › `backend` › Variables:
   - `ADMIN_INICIAL_EMAIL`: el correo real de la persona del equipo;
   - `ADMIN_INICIAL_PASSWORD`: una contraseña de 12 caracteres o más y 72 bytes como máximo, generada para la ocasión y marcada como secreta;
   - `ADMIN_INICIAL_NOMBRE`: opcional.
2. Desplegar. **Verificar:** en los logs aparece «Administrador inicial creado» y solo el correo, nunca la contraseña. Iniciar sesión en `$PWA` con esa cuenta: pide aceptar los términos (D-12) y después muestra el área de ADMIN.
3. **Borrar `ADMIN_INICIAL_PASSWORD`** de Railway (obligatorio). Las otras dos variables pueden quedar: con un ADMIN ya creado el seeder no hace nada (avisa en el log si la contraseña sigue definida). No hay pantalla para cambiar la contraseña: se cambia con «¿Olvidaste tu contraseña?» cuando el correo (DEP-08) funcione.

Si el correo ya tiene una cuenta con otro rol, o la contraseña no cumple el largo, el arranque **falla** y no se crea ni se promueve nada. Así nadie puede adelantarse registrando ese correo.

### 7.2 Funcionarios (DEP-05)

1. La persona se registra en `$PWA` y **confirma que el registro le funcionó a ella**. Si al registrarse vio «El correo ya está registrado», no se asigna: primero recupera la cuenta con «¿Olvidaste tu contraseña?» (cuando DEP-08 funcione) o se revisa la cuenta con ella. El registro no verifica la propiedad del correo. El script muestra la fecha de registro de la cuenta antes de cambiarla.
2. Desde la raíz del repo:

   ```bash
   railway connect postgis
   #   viasegura=# \set email 'persona@ejemplo.com'
   #   viasegura=# \set distrito 'Miraflores'
   #   viasegura=# \i backend/scripts/asignar-funcionario.sql
   ```

   El script falla sin cambiar nada si el correo o el distrito no existen, o si la cuenta es ADMIN. Los detalles (y el modo para devolver la cuenta a CIUDADANO) están en su cabecera.
3. **Verificar:** la persona recarga la PWA y ve la bandeja de su distrito. El rol se lee de la base en cada petición, así que no hace falta volver a iniciar sesión, y una revocación corta el acceso de inmediato.

Mientras D-10 siga abierta, la jurisdicción es `usuario.distrito_id`.

### 7.3 Prueba de humo (DEP-10)

Después de cada despliegue de `main`. La corre `qa-e2e` con la PWA en el navegador (escritorio y móvil) y deja el informe donde indique el coordinador.

| # | Comprobación | Resultado esperado |
|---|---|---|
| 1 | `GET $API/actuator/health` | `{"status":"UP"}` |
| 2 | `GET $API/api/distritos`, `GET $API/api/categorias` | 43 distritos; categorías estándar activas |
| 3 | Registro de un ciudadano nuevo en `$PWA` | Pide aceptar los términos; entra |
| 4 | Crear un reporte con foto (GPS y ubicación manual) | Se crea; aparece en el mapa |
| 5 | Abrir la `fotoUrl` del reporte sin sesión | 200, `image/jpeg`; sin EXIF (`exiftool` no muestra GPS ni modelo de equipo) |
| 6 | Foto de perfil | La ve su dueño; otra cuenta recibe 404 |
| 7 | CORS desde `$PWA` y desde otro origen | Pasa / 403 (§6) |
| 8 | Cabecera CSP en `$PWA` | Incluye `$API` |
| 9 | `/sw.js`, manifest e iconos | 200; Android ofrece instalar con el icono |
| 10 | Recuperar contraseña con una cuenta real y con una inexistente | 202 en ambos; el correo llega solo a la real |
| 11 | Push: activar en Android y en un iPhone con la PWA instalada; cambiar el estado del reporte como funcionario | Llega el aviso |
| 12 | Exportar a Excel desde la bandeja | Descarga el `.xlsx` |
| 13 | `$API/actuator/env`, `$API/v3/api-docs` | No responden 200 |
| 14 | Subir una foto de 11 MB | 413 con mensaje legible; el reporte no queda en la cola offline |
| 15 | Respaldo de anoche | Existe en `ciudadviva-respaldos` |
| 16 | Caché de Cloudflare delante del API (`api` va con proxy): `curl -sI` a la foto de perfil (con `Authorization`), a `/api/auth/me` y a una foto de reporte | La foto de perfil y `/api/**` **no** quedan en caché (`cf-cache-status` distinto de `HIT`; el backend envía `Cache-Control: private` en la foto de perfil). La foto de reporte, pública e inmutable, sí puede cachearse. |

## 8. Respaldo y restauración

**Revisión semanal:**
- **En R2:** que el objeto más reciente de `ciudadviva-respaldos` tenga **menos de 24 h**, con un tamaño parecido al de los días anteriores.
- **En Railway:** que `railway cron list --service respaldo-bd` no muestre corridas fallidas.

Un respaldo que dejó de correr no avisa por sí mismo más allá del correo de Railway (§5.3, paso 5).

**Prueba de restauración** (una vez al mes y antes de cada release), en la máquina local con el `docker compose` de `backend/`:

```bash
# 1. Descargar el último volcado de ciudadviva-respaldos (panel de R2 › objeto › Download).
# 2. Base vacía en el PostGIS local
docker exec viasegura-db psql -U viasegura -d viasegura -c "CREATE DATABASE restaurada;"
# 3. Restaurar. El volcado de respaldo-bd es formato custom (§5.3). Probado el 25/10 con un
#    volcado del PostGIS de desarrollo: copia idéntica (backend/README.md, «Respaldo diario»).
docker exec -i viasegura-db pg_restore -U viasegura -d restaurada --no-owner --no-acl < volcado.dump
# 4. Arrancar el API contra la copia (sin migraciones pendientes: Flyway valida y no aplica nada)
#    (desde backend/; el perfil dev exige DB_* y JWT_SECRET)
DB_URL=jdbc:postgresql://localhost:${POSTGRES_PORT:-5432}/restaurada \
  DB_USERNAME=viasegura DB_PASSWORD=viasegura JWT_SECRET=$(openssl rand -base64 48) \
  mvn spring-boot:run -Dspring-boot.run.profiles=dev
# 5. Comprobar: login con una cuenta conocida, conteo de reportes igual al de producción en la fecha del volcado.
# 6. Borrar la copia: contiene datos personales de producción.
docker exec viasegura-db psql -U viasegura -d viasegura -c "DROP DATABASE restaurada;"
```

**Restaurar producción** (pérdida o corrupción de la base):

1. Avisar en el canal del equipo y pausar el `backend` (Railway › servicio › … › Remove/Stop deployment), para que nadie escriba durante la restauración.
2. Crear un servicio `postgis` nuevo (§5.1) o vaciar la base actual.
3. Abrir un túnel sin psql interactivo: `railway connect postgis --tunnel-only` (verificar el puerto local que muestra) y, en otra terminal, `pg_restore -h 127.0.0.1 -p <puerto> -U viasegura -d viasegura --no-owner --no-acl volcado.dump`.
4. Volver a desplegar `backend` y correr la prueba de humo (§7.3).

## 9. Rotación de secretos e incidentes

| Secreto | Cómo rotarlo | Efecto en los usuarios |
|---|---|---|
| `JWT_SECRET` | Generar otro (§4), reemplazarlo en `backend`, redesplegar. | Todas las sesiones vencen: cada usuario vuelve a iniciar sesión. Los reportes en la cola offline se reenvían después del login. |
| `POSTGRES_PASSWORD` | `railway connect postgis` → `ALTER ROLE viasegura WITH PASSWORD '<nuevo>';` (sin dejarlo en el historial de la terminal), actualizar la variable en `postgis` y redesplegar `backend` y `respaldo-bd` (usan la referencia). La nueva, **solo alfanumérica**, como en §4: va sin codificar en la URL de `respaldo-bd` (§5.3). | Corte breve del API. |
| Tokens R2 (fotos, respaldos) | Crear un token nuevo con el mismo alcance, reemplazar las variables, redesplegar y **después** revocar el viejo. | Ninguno. |
| `CORREO_API_KEY` | Igual: clave nueva, redesplegar, revocar la vieja. | Ninguno. |
| Claves VAPID | **Solo si se comprometió la privada.** Par nuevo, redesplegar. | Todas las suscripciones push dejan de servir; cada usuario vuelve a suscribirse al iniciar sesión. |

**Incidente de seguridad** (por ejemplo, un secreto filtrado o un acceso indebido a datos):

1. Rotar lo comprometido (tabla de arriba) y revisar los logs (`railway logs`).
2. Registrar el incidente por escrito (qué pasó, cuándo se supo, qué datos y cuántas personas, qué se hizo), aunque no haya que notificarlo (DS 016-2024-JUS, art. 35).
3. Si expone datos personales en volumen o puede perjudicar a las personas, **notificar a la ANPD y a los afectados en 48 h** desde que se supo (art. 34). Quién lo hace lo decide el usuario (decisiones pendientes, §7).

## 10. Publicar una versión nueva y volver atrás

- **Publicar:** al fusionar en `main` el PR de un `release/*` o de un `hotfix/*`, Railway reconstruye `backend` y Vercel reconstruye la PWA, en paralelo. Por eso cada cambio del API tiene que ser **compatible con la PWA anterior durante una versión** (propuesta de despliegue, riesgo 1). Si una versión no puede cumplirlo, desactivar antes en Vercel la asignación automática del dominio de producción y promover el despliegue a mano cuando el API ya esté arriba (verificar el nombre exacto de la opción).
- **Después de publicar:** prueba de humo (§7.3).
- **Volver atrás:** Railway › `backend` › Deployments › el anterior › *Redeploy*; Vercel › Deployments › el anterior › *Instant Rollback* (en Hobby, verificar hasta cuántas versiones atrás). Las migraciones de Flyway no se deshacen: una versión vieja arranca sobre un esquema más nuevo solo si las migraciones fueron aditivas (columnas nulables, tablas nuevas). Nunca restaurar un respaldo para «deshacer» una migración sin antes medir cuántos datos se perderían.

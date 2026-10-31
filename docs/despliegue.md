# Despliegue de Ciudad Viva (runbook)

> Procedimiento para desplegar el MVP en **Railway** (API + PostGIS + respaldo), **Vercel** (PWA), **Cloudflare R2** (fotos y respaldos) y **Resend** (correo por HTTP). Diseño, opciones y fuentes: `project-context/decisions/propuestas/2026-10-21-despliegue-mvp.md` (aceptada el 21/10). Diagrama: `docs/arquitectura/c4-despliegue.md`.
>
> Versión 0.5 · 2026-10-31 · v0.8.0 · El 31/10, con la release v0.8.0: el pool vuelve a 10 por BE-12, las variables opcionales de la purga de BE-15 (§5.2 y §10.1) y los términos que siguen en v1 (§10.1). El primer despliegue (DEP-09) se hizo el 25/10 con v0.7.1, y v0.7.2 agrega `respaldo-bd` (§5.3). El 28/10 se sumó la operación: la política de reinicio y la primera corrida de `respaldo-bd`, y una sección nueva (§11) con las defensas del API, los límites de gasto y el DNS de Resend. El 30/10, lo que pide la **v0.8.0**: el servicio `inferencia` (§5.4, DEP-13), las variables nuevas del `backend` (§5.2), el orden de publicación (§10.1), los interruptores (§10.2), la prueba de humo ampliada (§7.3), el encabezado de origen (§11.4, DEP-14) y la operación de la moderación (§11.5). Lo que sigue marcado **(verificar)** se confirma con la prueba de humo (DEP-10) y se corrige aquí.

## 0. Antes de empezar

**Requisitos de código.** Este runbook despliega una versión de `main` que ya incluye DEP-01 (secreto JWT), DEP-02 (perfil `prod` y actuator), DEP-03 (`backend/Dockerfile`), DEP-04 (ADMIN inicial), DEP-05 (script de funcionarios), DEP-06 (iconos y Node), DEP-08 (correo HTTP), DEP-11 (errores 413/405) y DEP-12 (fotos en R2). Sin DEP-12, cada despliegue del API borra las fotos.

**Desde la v0.8.0** el `backend` no arranca sin cuatro variables nuevas: `CAPTCHA_TIPO` (NC-08b), `CLASIFICACION_TIPO` (NC-04b), `MODERACION_TIPO` (NC-10b) y `ORIGEN_SECRETO` (DEP-14). Además, con `http`, la clasificación y la moderación necesitan el servicio `inferencia` (§5.4), y la PWA no compila sin `NEXT_PUBLIC_TURNSTILE_SITE_KEY` (§6). El orden para publicarla está en §10.1.

**Reglas.**

- **Ningún secreto se escribe en el repo, en un issue, en un PR ni en un chat.** Se generan en la máquina del responsable, se guardan en un gestor de contraseñas y se pegan directamente en el panel de Railway o Vercel.
  - **Quién:** desde el 25/10 lo hace el usuario, siguiendo este runbook paso a paso. Las sesiones de Claude no crean ni ven secretos. Antes de esa decisión, la sesión «dominio» ya había cargado tres: `JWT_SECRET`, el par VAPID y `POSTGRES_PASSWORD`. Qué hacer con ellos está en §5, «Estado al 25/10».
  - **Sin sellar** (decisión del usuario, 25/10). Railway puede sellar un secreto (menú ⋮ › *Seal*): se sigue usando, pero no vuelve a mostrarse en el panel, por la API ni por la CLI, y no se puede deshacer. El proyecto **no los sella**, y el panel de Railway hace de lugar donde se guardan.
    - **A cambio:** verificación en dos pasos en Railway, GitHub y Cloudflare. Y las sesiones de Claude no leen valores: para comprobar una variable miran solo su nombre o si tiene valor.
    - **Si más adelante se quiere sellar:** antes, copiar el valor al gestor de contraseñas que use el usuario. Los candidatos son `JWT_SECRET`, `VAPID_PRIVATE_KEY`, `CORREO_API_KEY`, `CAPTCHA_SECRET`, `ORIGEN_SECRETO`, `FOTOS_S3_SECRET_ACCESS_KEY` y `AWS_SECRET_ACCESS_KEY` (`respaldo-bd`).
    - **`POSTGRES_PASSWORD`:** se sellaría solo después de comprobar que siguen funcionando las referencias `DB_PASSWORD` y `BACKUP_DATABASE_URL` y `railway connect postgis` (§5.1 y §9).
- **Producción sin datos falsos** (decisión 6, 25/10): nunca se corre `backend/scripts/seed-datos-prueba.sql` contra producción. Inventa reportes en distritos reales y falsearía el índice público de desempeño. Los reportes de la demo los toma el equipo en calles reales.
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

El origen de la PWA no debe cambiar después de abrir a usuarios: push, la sesión y la cola offline son por origen.
- **Vercel:** la URL `*.vercel.app` sigue existiendo y sirve para depurar, no para los usuarios.
- **Railway:** la URL `*.up.railway.app` del `backend` **se borró** (§11.1). El API solo se alcanza por `$API`, a través del proxy de Cloudflare.

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
   - **Desde NC-09 el correo es requisito del registro.** Una cuenta nueva no inicia sesión hasta abrir el enlace de confirmación que le llega por correo (las cuentas anteriores a NC-09 quedaron confirmadas). Sin el envío con Resend funcionando y el dominio verificado, nadie que se registre puede entrar. Antes de desplegar NC-09, correr la verificación de abajo con un destinatario que no sea el dueño de la cuenta de Resend.
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
| `ORIGEN_SECRETO` | `openssl rand -hex 32` (64 caracteres hexadecimales, sin espacios ni saltos de línea) | La *Transform Rule* de Cloudflare **y** `backend`, con el mismo valor (§11.4, DEP-14) |

## 5. Railway

Crear un proyecto («Ciudad Viva», entorno `production`). **Hecho el 25/10**, a pedido del usuario, en su workspace y en plan Hobby. Región de cada servicio: **US East (Virginia)** (Settings › Deploy › Regions); no hay región en Sudamérica. **Fijarla siempre**: un servicio nuevo nace en `sfo` (oeste de EE. UU.).

**Después del primer despliegue (25/10, DEP-09),** el estado de abajo quedó atrás:
- **`backend`:** tiene el repo conectado en `main` y está desplegado con v0.7.1. Un disparador redespliega al fusionar en `main` y espera a que pase la CI («Wait for CI»).
  - Ese disparador exige que la app de Railway en GitHub tenga acceso a la organización `TP202620041`. Sin ese acceso, el primer despliegue funciona porque el repo es público, pero no hay despliegue automático.
- **`respaldo-bd`:** se crea con v0.7.2 (§5.3).
- **`inferencia`:** creado el 28/10 para la v0.8.0, sin repo conectado hasta la release (§5.4, DEP-13).

**Estado al 25/10** (lo hizo la sesión «dominio» a pedido del usuario):
- **`postgis`:** desplegado y sano (§5.1). Región `us-east4`, volumen de 5 GB.
- **`backend`:** configurado según §5.2 pero **sin el repo conectado** y sin despliegues.
  - Las variables `DB_*` son referencias a `postgis`. `JWT_SECRET` y un par VAPID **nuevo** se generaron y cargaron por stdin.
  - Faltan `CORREO_API_KEY` (la pega el usuario), `FOTOS_S3_ACCESS_KEY_ID` y `FOTOS_S3_SECRET_ACCESS_KEY` (falta R2 de producción) y `ADMIN_INICIAL_*`.
  - El dominio propio `api.ciudadviva.app` está creado en Railway; sus dos registros DNS los crea el usuario (§5.2, paso 5).
- **`respaldo-bd`:** todavía no; espera el bucket y el token de respaldos de R2.
- **Secretos cargados por una sesión antes de la decisión del 25/10:** `POSTGRES_PASSWORD` (al crear `postgis`), `JWT_SECRET` y el par VAPID. Se cargaron por stdin, así que no aparecieron en ninguna transcripción. Como el proyecto no sella (§0), quedan en el panel. Antes del primer despliegue se pueden regenerar (§4) sin efecto para nadie, porque todavía no hay sesiones ni suscripciones. El par VAPID se genera en una terminal propia, fuera de Claude Code, para que la clave privada no quede en una transcripción. Rotar `POSTGRES_PASSWORD` exige `ALTER ROLE` (§9).

**Cambios de variables en el panel** ([staged changes](https://docs.railway.com/deployments/staged-changes)): agregar, cambiar o borrar una variable deja un aviso de cambios pendientes, que se aplican con *Deploy*.
- **Sin redesplegar** (*Alt* + clic en *Deploy*): para cargar varias variables seguidas antes del primer despliegue, o para borrar `ADMIN_INICIAL_PASSWORD` (§7.1, paso 3). Los valores nuevos se aplican en el próximo despliegue de cada servicio.
- **Con *Deploy* normal**, que redespliega: cuando la app tiene que tomar ya un valor nuevo, como al rotar un secreto (§9) o al cambiar el pool (§5.2) después del primer despliegue.

**Si se usa la CLI de Railway desde Git Bash en Windows:**
- **Rutas:** las que empiezan con `/` se convierten en `C:/Program Files/Git/…` (pasó con `PGDATA`). Usar `MSYS_NO_PATHCONV=1` delante del comando, o el panel.
- **`railway variable delete`:** no acepta `--skip-deploys`, así que siempre redespliega.
- **Región:** `railway environment edit --service-config … deploy.multiRegionConfig '<json>'` no se aplicó; funcionó el parche JSON por stdin.
- **Secretos:** hasta el 25/10, las sesiones los cargaban con `railway variable set --stdin`, para que no aparecieran en la terminal ni en una transcripción. Desde la decisión de ese día, los pega el usuario en el panel, sin sellar (§0).

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
   - **No generar un dominio `*.up.railway.app`** («Generate Domain»). El del `backend` se borró el 25/10 (§11.1). El API solo se alcanza por `$API`, a través del proxy de Cloudflare. El `CNAME` `api` → `<id>.up.railway.app` de abajo **no cambia**: ese es el destino del dominio propio.
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
   | `FRONTEND_URL` | `https://ciudadviva.app` (NC-09). Opcional y recomendada: origen de la PWA, sin ruta, para el enlace de confirmación del correo (`<origen>/confirmar-cuenta?token=…`). Sin ella se usa el primer origen de `CORS_ALLOWED_ORIGINS`, que hoy es el mismo; definirla evita que el enlace cambie si algún día esa lista empieza por otro origen. Una URL que no sea un origen `http(s)` no arranca. |
   | `NOTIF_FROM` | `Ciudad Viva <no-reply@ciudadviva.app>` (**obligatoria** en `prod` con cualquier tipo de correo) |
   | `CORREO_TIPO` | `resend` (decisión del 21/10). **Obligatoria** en `prod`: sin ella, o con un valor distinto de `smtp` o `resend`, la app no arranca. |
   | `CORREO_API_KEY` | §3 |
   | `CAPTCHA_TIPO` | `turnstile` (NC-08b, 28/10: Cloudflare Turnstile reemplazó a reCAPTCHA v2, que era `recaptcha`). **Obligatoria** en `prod`: sin ella, o con un valor que el API no reconoce, la app no arranca. `ninguno` apaga a propósito el captcha del registro. |
   | `CAPTCHA_SECRET` | **Clave secreta** del widget de Turnstile; obligatoria con `CAPTCHA_TIPO=turnstile`. El API la usa para verificar el token contra `siteverify` de Cloudflare. El widget se crea en el panel de Cloudflare: **Turnstile › Add widget**, nombre `Ciudad Viva`, *hostnames* `ciudadviva.app` y `www.ciudadviva.app`, *Widget Mode* **Managed**, *pre-clearance* **No**. Cloudflare muestra el par al crearlo: la **Secret Key** va aquí y la **Site Key** al frontend (§6, `NEXT_PUBLIC_TURNSTILE_SITE_KEY`). No agregar `localhost` al widget de producción (Cloudflare lo desaconseja): en local se usan las claves de prueba de Cloudflare, que funcionan en cualquier dominio y aprueban o fallan siempre (`frontend/.env.example`); nunca en producción. La secreta de reCAPTCHA que estaba aquí no sirve con `turnstile`: se reemplaza. |
   | `CAPTCHA_HOSTNAMES` | **No obligatoria**: en `prod` vale por defecto `ciudadviva.app,www.ciudadviva.app` (NC-08b). Lista de *hostnames* separados por coma, sin esquema ni puerto, con comparación exacta y sin comodines: el API solo acepta tokens que Cloudflare resolvió en uno de ellos, y cualquier otro da **409**. **Tiene que coincidir con los *hostnames* del widget** en Cloudflare › Turnstile (los de `CAPTCHA_SECRET`): si se cambia uno sin el otro, todo registro da 409. Solo se define si la PWA pasa a servirse en otro dominio. Definirla vacía apaga la comparación: no hacerlo en producción. Las claves de prueba de Cloudflare responden el *hostname* `example.com`, otro motivo por el que nunca van en producción (fuera de `prod` la lista está vacía y por eso funcionan en local). |
   | `FOTOS_ALMACEN` | `s3` |
   | `FOTOS_S3_ENDPOINT` | endpoint de §2 |
   | `FOTOS_S3_REGION` | `auto` |
   | `FOTOS_S3_BUCKET_REPORTES` | `ciudadviva-fotos-reportes` |
   | `FOTOS_S3_BUCKET_PERFILES` | `ciudadviva-fotos-perfiles` |
   | `FOTOS_S3_ACCESS_KEY_ID` / `FOTOS_S3_SECRET_ACCESS_KEY` | token **fotos** de §2 |
   | `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | §4 |
   | `VAPID_SUBJECT` | `mailto:contacto@ciudadviva.app` (activo en Email Routing, §3) |
   | `JAVA_TOOL_OPTIONS` | `-Xms256m -Xmx512m -XX:+UseSerialGC -XX:+ExitOnOutOfMemoryError` |
   | `SPRING_DATASOURCE_HIKARI_MAXIMUMPOOLSIZE` | `10` desde la v0.8.0 (decisión del usuario del 30/10), el mismo valor que el que rige por defecto. Con BE-12 el refresco del índice es asíncrono y coalescido y usa a lo sumo una conexión: la prueba de carga de BE-12 (#140), con la imagen `prod` y el pool en 10, dio 16 × 201 con 16 reportes con foto simultáneos, sin «Connection is not available». La v0.7.x corría con `20` (decisión 20, 25/10), porque refrescaba en el hilo del commit (`propuestas/2026-10-22-refresco-indice-asincrono.md`). El cambio de 20 a 10 se hace junto con la publicación (§10.1, paso 4), nunca antes: la v0.7.x con 10 vuelve a agotar el pool. |
   | `CUENTAS_SIN_CONFIRMAR_PLAZO` | sin definir (`30d` por defecto; BE-15, desde la v0.8.0). Edad a partir de la cual se borra una cuenta de ciudadano que nunca confirmó su correo (decisión del usuario del 28/10). Duración de Spring (`30d`, `720h`); con menos de 1 día la app no arranca. Detalle: `backend/README.md`, «Purga de cuentas sin confirmar (BE-15)». |
   | `CUENTAS_SIN_CONFIRMAR_PURGA_CRON` | sin definir (`0 30 3 * * *` por defecto: todos los días a las 03:30, hora de Lima). Expresión cron de Spring con segundos. `-` apaga la purga; no hacerlo en producción, porque el borrado a los 30 días es una decisión del usuario (28/10) que prometen los términos v2. Cada corrida deja un `INFO` con cuántas cuentas borró, sin correos. |
   | `SPRINGDOC_HABILITADO` | sin definir (Swagger apagado); `true` solo para una demo y después se quita |
   | `CLASIFICACION_TIPO` | `http` (NC-04b, desde la v0.8.0). **Obligatoria** en `prod`: sin ella, o con otro valor que `http` o `falso`, la app no arranca. `falso` es el interruptor que apaga la sugerencia (§10.2). |
   | `CLASIFICACION_URL` | `http://${{inferencia.RAILWAY_PRIVATE_DOMAIN}}:8000`, por referencia al servicio de §5.4. Solo la base, sin ruta ni barra final: con `…:8000/v1` la app no arranca. No es un secreto. |
   | `CLASIFICACION_UMBRAL` | sin definir (0,50 por defecto). Se cambia al calibrar con fotos de Lima (NC-03b), sin código nuevo. |
   | `MODERACION_TIPO` | `http` (NC-10b, D-15, desde la v0.8.0). **Obligatoria** en `prod` y sin valor por defecto: sin ella, o con otro valor que `http` o `ninguna`, la app no arranca. Con `http`, si `inferencia` no responde, un reporte **con foto** recibe 503 `MODERACION_NO_DISPONIBLE` (falla cerrada). `ninguna` apaga la revisión de la foto y **publica fotos sin revisar** (§10.2). **Solo se carga con `http` después de que `inferencia` sirve el modelo de moderación** (§5.4 y §10.1). |
   | `MODERACION_URL` | `http://${{inferencia.RAILWAY_PRIVATE_DOMAIN}}:8000`, la misma referencia que `CLASIFICACION_URL` y con las mismas reglas. |
   | `MODERACION_UMBRAL` | sin definir (0,70 por defecto, decisión del usuario del 28/10). Se rechaza la foto si el puntaje es mayor o igual. Entre 0.5 y 0.9, con punto decimal; fuera de rango la app no arranca. |
   | `ORIGEN_SECRETO` | §4 (DEP-14, desde la v0.8.0). **Obligatoria** en `prod`: sin ella, vacía, con menos de 32 caracteres o con caracteres que no son ASCII visibles, la app no arranca. Es el mismo valor que la *Transform Rule* de Cloudflare; **primero la regla, después la variable** (§11.4). Sin sellar, como el resto de los secretos (§0). `ninguno` es el interruptor de emergencia (§10.2). |
   | `ORIGEN_SECRETO_ANTERIOR` | sin definir. Solo durante una rotación de `ORIGEN_SECRETO` (§9); si queda puesta, cada arranque deja un WARN. |

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
#  - Flyway: "Successfully applied N migrations" en la primera corrida (todas las V*.sql; 18 en v0.7.0 y v0.7.1;
#    21 en v0.8.0). Al pasar de v0.7.x a v0.8.0 aplica 3: V19, V20 y V21.
#  - DistritoSeeder: 43 distritos; MunicipalidadSeeder: 43 municipalidades
#  - "Started ViaSeguraApplication"; ninguna línea con "show-sql" ni DEBUG
#  - Desde v0.8.0: "Encabezado de origen exigido (DEP-14)…", "Clasificador HTTP: …", "Moderador HTTP: …",
#    ningún WARN "APAGADO"/"APAGADA" y ninguna línea "Clasificador falso" (las tres solo con un
#    interruptor puesto, §10.2)
curl -s $API/actuator/health                       # {"status":"UP"} y nada más
curl -s $API/api/distritos | grep -o '"id"' | wc -l   # 43 (desde v0.8.0, solo por Cloudflare: directo a Railway da 403, §11.4)
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
   - **Sin política de reinicio.** En Railway, los servicios con cron no la tienen. El panel lo dice: «Services with a cron schedule do not have a restart policy» (verificado el 28/10). Una corrida que falla no se repite sola. Lo que cubre un fallo:
     - **los 3 reintentos de `curl`** en la subida a R2, dentro de la misma corrida. Cubren un fallo pasajero de la red o de R2;
     - **la corrida del día siguiente.** Crea un objeto con otro nombre, así que el día perdido no pisa nada; con la retención de 30 días (§2), basta con un respaldo bueno cerca;
     - **la revisión de §8** (que el último objeto tenga menos de 24 h, y `railway cron list`) y el correo de Railway (paso 5). Detectan un fallo que se repite. Si hace falta un respaldo ya, se corre a mano con `railway cron run --service respaldo-bd`.
   - **Por qué no se cuelga:** el script corta solo, con 15 s para conectar a la base, 60 s de espera por un lock y 15 min para la subida. Un cuelgue haría que Railway saltara las corridas siguientes.
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
3. **Hecho el 28/10:** la primera corrida de prueba contra R2.
   - **Hora:** 22:40 UTC.
   - **Objeto:** `prueba-2026-10-28T22-40-15Z.dump`, de 132 013 bytes, en `ciudadviva-respaldos`.
   - La limpieza del paso 1 (quitar `BACKUP_FILE_PREFIX` y borrar el objeto) sigue valiendo si no se hizo.

Si el plan de Railway incluye respaldos del volumen (en el servicio `postgis` › Backups), activar también el diario y el semanal (verificar disponibilidad en Hobby).

### 5.4 Servicio `inferencia` (DEP-13, v0.8.0)

El servicio de `inferencia/` (FastAPI + ONNX en CPU) sugiere la categoría de la foto (RF-DETR Nano, `POST /v1/detecciones`, NC-03a) y la modera antes de publicarla (`POST /v1/moderacion`, NC-10a). Contrato y cifras: `inferencia/README.md`. Lo llama solo el `backend`, por la red privada. No guarda nada y **no usa secretos**.

**Estado al 28/10:**
- El servicio `inferencia` existe en el proyecto, con 2 vCPU y 1 GB. Corre el código de `develop` subido con `railway up`, **sin repo conectado**. Esa imagen es anterior al modelo de moderación (NC-10a, #129) y al tope de 8 MP (#133, 29/10): hay que volver a subirla antes de la release.
- `/salud` responde 200 y en reposo usa 223 MiB.
- La red privada es doble pila: `0.0.0.0`, el valor del `Dockerfile`, alcanza, y no hace falta `INFERENCIA_HOST`. La URL privada es `inferencia.railway.internal`.
- El *healthcheck* `/salud` está configurado (Settings › Deploy) desde el 28/10. Con la falla cerrada de la moderación (D-15), un redespliegue sin *healthcheck* dejaría sin entrar los reportes con foto mientras arranca el servicio.

**Configuración** (Settings del servicio):

| Dónde | Valor |
|---|---|
| Región | US East (Virginia), como el resto (§5) |
| *Resource Limits* | **2 vCPU y 1 GB**, fijos. Acotan el costo, y la RAM medida con los dos modelos y 4 clientes no pasa de ~505 MiB con el tope de 8 MP (`inferencia/README.md`). |
| Source (cuando se conecte el repo, paso 5 de §10.1) | rama `main`; *Root Directory* `inferencia`; *Watch Paths* `/inferencia/**`. Construye con `inferencia/Dockerfile`. |
| Networking | **Sin dominio público** y sin TCP Proxy: solo red privada. |
| Deploy | *Healthcheck Path* `/salud` (configurado); *Restart Policy* `On Failure`, como `backend` (verificar que esté así). |

**Variables** (ninguna es secreta; las demás quedan con el valor del `Dockerfile`):

| Variable | Valor | Por qué fija |
|---|---|---|
| `PORT` | `8000` | Es el puerto de `CLASIFICACION_URL` y `MODERACION_URL`. |
| `INFERENCIA_HILOS` | `2` | Igual a las vCPU, y sin cambiar entre despliegues: la misma foto tiene que dar la misma sugerencia (D-08). |
| `INFERENCIA_MODERACION_HILOS` | `1` | Con los mismos hilos, la misma foto da el mismo puntaje en la vista previa y en la creación. |
| `INFERENCIA_MAX_MEGAPIXELES` | sin definir (`8` en la imagen, decisión del usuario del 28/10) | Acota la RAM. El `backend` envía fotos saneadas de ≤ 2048 px por lado (≤ 4,2 MP), así que nunca llega a este tope. |

**Subir el código antes de la release** (paso 1 de §10.1). Mientras el servicio no tenga el repo conectado, se sube con la CLI desde la raíz del repo, con la rama `develop` (o la `release/v0.8.0`) al día, que ya traen NC-10a y el tope de 8 MP:

```bash
git switch release/v0.8.0 && git pull     # o develop
railway up inferencia --path-as-root --service inferencia
```

- `--path-as-root` sube la carpeta `inferencia/` como raíz del archivo, así que Railway encuentra el `Dockerfile` arriba ([`railway up`](https://github.com/railwayapp/cli/blob/master/src/commands/up.rs), consultado el 30/10/2026).
- Cada construcción descarga torch y los pesos de los dos modelos de Hugging Face y comprueba sus hashes contra `modelos/modelo.json` y `modelos/moderacion.json`: tarda, y hay que esperar a que termine. Si un hash no coincide, la construcción falla y sigue sirviendo la versión anterior.

**Verificar** (no tiene dominio público, así que se consulta desde adentro del contenedor):

```bash
railway ssh --service inferencia -- python -c "import urllib.request; print(urllib.request.urlopen('http://127.0.0.1:8000/salud').read())"
# {"estado":"ok","version_modelo":"rdd2022-…","version_moderacion":"nsfw-vit-tiny-384-0c26ec2-…"}
```

- **Sin `version_moderacion`, la imagen no trae NC-10a:** no se carga `MODERACION_TIPO=http` en el `backend` (§10.1, paso 3), porque con la falla cerrada ningún reporte con foto entraría.
- **RAM en reposo** en *Metrics*: se esperan unos 290 MiB con los dos modelos. Es una estimación, no una medida: 223 MiB medidos el 28/10 solo con RF-DETR, más los ~65 MiB que la propuesta de moderación calcula para su modelo. Anotar la cifra real en `inferencia/README.md`.

**Después de la release** (paso 5 de §10.1): Settings › Source › conectar `TP202620041/tesis`, rama `main`, con la configuración de la tabla y el disparador que espera la CI («Wait for CI»), igual que `backend`. Desde entonces se despliega solo al fusionar en `main` y `railway up` ya no se usa.

**Medir en producción** (DEP-13), con la prueba de humo (§7.3, punto 21): la duración de cada llamada queda en el log del `backend`, una línea por llamada («`Moderacion: 200 en … ms`» e «`Inferencia: 200 en … ms`»). No se usa `scripts/medir_latencia.py`, que no está en la imagen. Las cifras van a `inferencia/README.md`.

## 6. Vercel

1. Add New › Project › importar `TP202620041/tesis`.
2. **Root Directory:** `frontend`. Framework: Next.js (detectado). Build command: el de `package.json` (`npm run build`, que también compila el Service Worker). Node: lo fija `engines.node` (24.x).
3. **Environment Variables › Production:** `NEXT_PUBLIC_API_BASE_URL` = `https://api.ciudadviva.app` (sin barra final).
   - Se hornea en el build y en la CSP: `next.config.ts` la pone en `connect-src` y en `img-src`, así que las fotos que sirve el API también pasan.
   - Cambiarla exige redesplegar.
   - `NEXT_PUBLIC_TURNSTILE_SITE_KEY` = la **Site Key** del widget de Turnstile de §5.2 (NC-08b; reemplazó a `NEXT_PUBLIC_RECAPTCHA_SITE_KEY`, que ya no se lee y se puede borrar). También obligatoria en Production y Preview: sin ella el build falla, igual que sin la URL del API, para que el registro no salga sin captcha mientras el API lo exige. Se hornea en el bundle, así que cambiarla exige redesplegar. `next.config.ts` abre en la CSP el host de Turnstile, `https://challenges.cloudflare.com`, en `script-src`, `frame-src` y `connect-src`; ningún origen de Google. En un *Preview* (`*.vercel.app`) el widget de producción muestra un error de dominio, porque solo admite los *hostnames* de §5.2; no cambia nada, porque un Preview contra el API de producción ya fallaba por CORS (`frontend/README.md`, «Despliegue en Vercel»).
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
   - `ADMIN_INICIAL_EMAIL`: el correo del usuario, dueño del proyecto (decisión 5, 25/10). No se escribe en el repo, que es público;
   - `ADMIN_INICIAL_PASSWORD`: una contraseña de 12 caracteres o más y 72 bytes como máximo, sin tildes ni ñ (ocupan más de un byte), generada para la ocasión. **Hay que guardarla fuera de Railway antes del paso 3**, que la borra: por ejemplo, en el gestor de contraseñas del teléfono, aceptando guardarla al iniciar sesión por primera vez en `$PWA`;
   - `ADMIN_INICIAL_NOMBRE`: opcional.
2. Desplegar. **Verificar:** en los logs aparece «Administrador inicial creado» y solo el correo, nunca la contraseña. Iniciar sesión en `$PWA` con esa cuenta: pide aceptar los términos (D-12) y después muestra el área de ADMIN.
3. **Borrar `ADMIN_INICIAL_PASSWORD`** de Railway (obligatorio). Las otras dos variables pueden quedar: con un ADMIN ya creado el seeder no hace nada (avisa en el log si la contraseña sigue definida). No hay pantalla para cambiar la contraseña: se cambia con «¿Olvidaste tu contraseña?» cuando el correo (DEP-08) funcione.

Si el correo ya tiene una cuenta con otro rol, o la contraseña no cumple el largo, el arranque **falla** y no se crea ni se promueve nada. Así nadie puede adelantarse registrando ese correo.

### 7.2 Funcionarios (DEP-05)

1. La persona se registra en `$PWA`, abre el enlace de confirmación que le llega al correo y **confirma que el registro le funcionó a ella** (inicia sesión con su contraseña). Si al registrarse vio «El correo ya está registrado», alguien pudo registrarse antes con su correo: no se asigna hasta que ella recupere la cuenta. Desde NC-09b «¿Olvidaste tu contraseña?» no envía nada a una cuenta sin confirmar, así que el orden es: primero confirma la cuenta con el enlace del correo de confirmación que recibió cuando se registró la otra persona (si venció, la página del enlace le deja pedir otro); si ya no tiene ese correo, lo pide de nuevo con «Reenviar el enlace», que «¿Olvidaste tu contraseña?» ofrece después de pedir el token (NC-09c). Con la cuenta confirmada, cambia la contraseña con «¿Olvidaste tu contraseña?» y entra con ella. Si nada de eso funciona, se revisa la cuenta con ella. Desde NC-09 el registro verifica la propiedad del correo: una cuenta no inicia sesión sin abrir el enlace que llega a ese buzón, así que entrar con la contraseña prueba que el correo es suyo. Las cuentas creadas antes de NC-09 quedaron confirmadas sin esa prueba. El script muestra la fecha de registro de la cuenta antes de cambiarla.
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
| 3 | Registro de un ciudadano nuevo en `$PWA` | Pide aceptar los términos y muestra «Revisa tu correo», sin entrar. Antes de confirmar, el login responde «Confirma tu correo…» con «Reenviar el enlace». El correo llega; su enlace abre `$PWA/confirmar-cuenta`, que dice «¡Listo! Tu correo está confirmado» y deja la URL sin el token. Después, entra (NC-09). |
| 4 | Crear un reporte con foto (GPS y ubicación manual) | Se crea; aparece en el mapa |
| 5 | Abrir la `fotoUrl` del reporte sin sesión | 200, `image/jpeg`; sin EXIF (`exiftool` no muestra GPS ni modelo de equipo) |
| 6 | Foto de perfil | La ve su dueño; otra cuenta recibe 404 |
| 7 | CORS desde `$PWA` y desde otro origen | Pasa / 403 (§6) |
| 8 | Cabecera CSP en `$PWA` | Incluye `$API` |
| 9 | `/sw.js`, manifest e iconos | 200; Android ofrece instalar con el icono |
| 10 | Recuperar contraseña con una cuenta confirmada, con una sin confirmar y con una inexistente | 202 en los tres; el correo con el token llega solo a la confirmada (NC-09b). En los tres la PWA muestra el mismo aviso «Si todavía no confirmaste tu cuenta, no te llegará este correo…» con «Reenviar el enlace»; con la cuenta sin confirmar, ese botón hace llegar el enlace de confirmación (NC-09c) |
| 11 | Push: activar en Android y en un iPhone con la PWA instalada; cambiar el estado del reporte como funcionario | Llega el aviso |
| 12 | Exportar a Excel desde la bandeja | Descarga el `.xlsx` |
| 13 | `$API/actuator/env`, `$API/v3/api-docs` | No responden 200 |
| 14 | Subir una foto de 11 MB | 413 con mensaje legible; el reporte no queda en la cola offline |
| 15 | Respaldo de anoche | Existe en `ciudadviva-respaldos` |
| 16 | Caché de Cloudflare delante del API (`api` va con proxy): `curl -sI` a la foto de perfil (con `Authorization`), a `/api/auth/me` y a una foto de reporte | La foto de perfil y `/api/**` **no** quedan en caché (`cf-cache-status` distinto de `HIT`; el backend envía `Cache-Control: private` en la foto de perfil). La foto de reporte, pública, sí puede cachearse: lleva `Cache-Control: max-age=2592000, public, s-maxage=3600, immutable` (NC-11a). Anotar si Cloudflare respeta `s-maxage` (`cf-cache-status: HIT` y `age` menor que 3600); de eso depende §11.5. |

**Desde la v0.8.0**, además:

| # | Comprobación | Resultado esperado |
|---|---|---|
| 17 | **Turnstile** (NC-08b) en el registro de `$PWA`, en escritorio y en el teléfono | Aparece el widget de Cloudflare y, resuelto, el registro sigue al punto 3. La consola no muestra violaciones de la CSP con `challenges.cloudflare.com`. Sin el widget resuelto el registro no se envía. Si todo registro da 409, los *hostnames* del widget no coinciden con `CAPTCHA_HOSTNAMES` (§5.2). |
| 18 | **Confirmación del correo** (NC-09) con una dirección que no sea la del dueño de la cuenta de Resend | Es el punto 3: el correo llega y su enlace apunta a `https://ciudadviva.app/confirmar-cuenta?token=…` (`FRONTEND_URL`), no a `www` ni a una URL de Vercel. |
| 19 | **Sugerencia con el modelo real** (NC-04b): una foto con un bache claro, tomada en la calle | La vista previa sugiere **«Bache»**. Después de crear el reporte, en `railway connect postgis`: `SELECT version_modelo_sugerencia FROM reporte ORDER BY id DESC LIMIT 1;` da `rdd2022-…`. Si queda nula, la sugerencia falló sin avisar: revisar el log del `backend` (`Inferencia: …`). |
| 20 | **Moderación** (NC-10b, NC-10c) | (a) Una foto normal de una pista se crea (201), y el log del `backend` muestra `Moderacion: 200 en … ms`. (b) Un título con una palabra de la lista de groserías recibe el aviso de la PWA (400 `TEXTO_NO_PERMITIDO`) y no aparece en «Mis reportes». (c) **Una foto rechazada no se guarda.** El rechazo de una foto no se provoca en producción: no hay muestras positivas y no se van a juntar (`backend/README.md`, «Moderación de contenido»), y lo prueba `ModeracionCreacionIT` con un doble. Lo que se comprueba es que no quedan objetos huérfanos: la cantidad de objetos de `ciudadviva-fotos-reportes` (panel de R2; verificar dónde lo muestra) es igual a `SELECT count(*) FROM reporte WHERE foto_url IS NOT NULL;`. |
| 21 | **Latencia de la moderación** en Railway (DEP-13) | En el log del `backend`, las líneas `Moderacion: 200 en … ms` e `Inferencia: 200 en … ms` de la prueba. NC-10b midió en local ~2,1 s para la última moderación con 4 moderaciones y 4 detecciones a la vez, contra **2,5 s** de lectura: si en Railway una moderación sola ya pasa de ~1 s, o aparecen `Moderacion: sin respuesta en …`, avisar antes de abrir a usuarios, porque con la falla cerrada cada timeout es un 503 al ciudadano. Anotar las cifras en `inferencia/README.md`. |
| 22 | **Denuncia y ocultamiento** (NC-11a, NC-11b), con dos cuentas de ciudadano y la del ADMIN, sobre un reporte de la prueba | (a) La cuenta B denuncia el reporte de A («Denunciar contenido»; si NC-11b no llegó a la release, con `POST $API/api/reportes/{id}/denuncias`); una segunda denuncia de B recibe 409 `DENUNCIA_REPETIDA`. (b) El ADMIN lo ve en la bandeja de moderación y **oculta el reporte** con un motivo: desaparece del mapa, su detalle público da 404 y, en `GET $API/api/desempeno/distritos`, el `totalReportes` de su distrito y categoría baja en 1. (c) **Restablecerlo** lo devuelve todo. (d) **Ocultar solo la foto:** el reporte sigue visible con `fotoUrl` en `null` y no cambia el índice; la URL de la foto da 404 después de purgarla en Cloudflare (§11.5). Al terminar, el creador cancela sus reportes de prueba (un reporte `CANCELADO` no cuenta en el índice). |
| 23 | **Encabezado de origen** (DEP-14) | Los `curl` de §11.4: directo a Railway, 403; por Cloudflare, 200. |

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
| `ORIGEN_SECRETO` (DEP-14) | **Sin corte**, en cuatro pasos: (1) generar el nuevo con `openssl rand -hex 32`; (2) Railway › `backend`: `ORIGEN_SECRETO_ANTERIOR` = el valor actual (está en el gestor de contraseñas) y `ORIGEN_SECRETO` = el nuevo, y desplegar; desde aquí el API acepta los dos y el log dice «Se acepta tambien ORIGEN_SECRETO_ANTERIOR»; (3) Cloudflare: editar la *Transform Rule* (§11.4) con el valor nuevo y comprobar que por Cloudflare responde 200; (4) Railway: borrar `ORIGEN_SECRETO_ANTERIOR` y desplegar. **Si se filtró**, es la misma rotación; para cortar el acceso antes, se omite el paso 2 (solo el nuevo, desplegar y editar la regla enseguida). | Ninguno con los cuatro pasos. Omitiendo el paso 2, unos segundos de 403 entre el despliegue y la regla. |

**Incidente de seguridad** (por ejemplo, un secreto filtrado o un acceso indebido a datos):

1. Rotar lo comprometido (tabla de arriba) y revisar los logs (`railway logs`).
2. Registrar el incidente por escrito (qué pasó, cuándo se supo, qué datos y cuántas personas, qué se hizo), aunque no haya que notificarlo (DS 016-2024-JUS, art. 35).
3. Si expone datos personales en volumen o puede perjudicar a las personas, **notificar a la ANPD y a los afectados en 48 h** desde que se supo (art. 34). Quién lo hace lo decide el usuario (decisiones pendientes, §7).

## 10. Publicar una versión nueva y volver atrás

- **Publicar:** al fusionar en `main` el PR de un `release/*` o de un `hotfix/*`, Railway reconstruye `backend` y Vercel reconstruye la PWA, en paralelo. Por eso cada cambio del API tiene que ser **compatible con la PWA anterior durante una versión** (propuesta de despliegue, riesgo 1). Si una versión no puede cumplirlo, desactivar antes en Vercel la asignación automática del dominio de producción y promover el despliegue a mano cuando el API ya esté arriba (verificar el nombre exacto de la opción).
- **Después de publicar:** prueba de humo (§7.3).
- **Volver atrás:** Railway › `backend` › Deployments › el anterior › *Redeploy*; Vercel › Deployments › el anterior › *Instant Rollback* (en Hobby, verificar hasta cuántas versiones atrás). Las migraciones de Flyway no se deshacen: una versión vieja arranca sobre un esquema más nuevo solo si las migraciones fueron aditivas (columnas nulables, tablas nuevas). Nunca restaurar un respaldo para «deshacer» una migración sin antes medir cuántos datos se perderían.

### 10.1 Publicar la v0.8.0: el orden

La v0.8.0 no arranca sin variables nuevas, y el `backend` con `MODERACION_TIPO=http` no puede llegar a producción antes que el servicio que modera: con la falla cerrada, ningún reporte con foto entraría. Por eso todo lo de abajo se hace **antes de fusionar** el `release/v0.8.0` en `main`, en este orden:

1. **Subir `inferencia`** con NC-10a y el tope de 8 MP: `railway up inferencia --path-as-root --service inferencia` desde `develop` o desde la `release/v0.8.0` (§5.4). Esperar a que termine la construcción.
2. **Comprobar** que su `/salud` devuelve `version_moderacion` (§5.4, «Verificar»). Si no aparece, no seguir con `MODERACION_TIPO=http`.
3. **Encabezado de origen, primero en Cloudflare** (§11.4, pasos 1 y 2): generar `ORIGEN_SECRETO` y crear la *Transform Rule*. La v0.7.x ignora el encabezado, así que la regla no cambia nada todavía.
4. **Cargar las variables** con **Alt + Deploy**, que no redespliega (§5); la v0.7.x las ignora:
   - en `backend` (§5.2): `CLASIFICACION_TIPO=http`, `CLASIFICACION_URL`, `MODERACION_TIPO=http`, `MODERACION_URL`, `ORIGEN_SECRETO` (el mismo valor de la regla), `CAPTCHA_TIPO=turnstile`, `CAPTCHA_SECRET` y `FRONTEND_URL=https://ciudadviva.app`. `MODERACION_UMBRAL`, `CLASIFICACION_UMBRAL` y las dos `CUENTAS_SIN_CONFIRMAR_*` quedan sin definir;
   - en `backend`, también: `SPRING_DATASOURCE_HIKARI_MAXIMUMPOOLSIZE` pasa de `20` a `10` (BE-12, decisión del usuario del 30/10). Con *Alt + Deploy* el valor se aplica en el próximo despliegue, que es el de la v0.8.0 (paso 5): la v0.7.x, que todavía refresca el índice en el hilo del commit, sigue con 20;
   - en Vercel (§6): `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, en Production y Preview. Sin ella el build de la PWA falla.

   Los dos secretos (`ORIGEN_SECRETO` y `CAPTCHA_SECRET`) los pega el usuario, sin sellar (§0). Comprobar en el panel que cada variable existe, mirando solo su nombre.
5. **Publicar la v0.8.0:** fusionar el `release/v0.8.0` en `main`. Railway reconstruye `backend` (después de la CI) y Vercel, la PWA. En el log del `backend`: las tres migraciones (V19–V21), «Encabezado de origen exigido (DEP-14)», «Clasificador HTTP: …», «Moderador HTTP: …» y ninguna línea de interruptor (§5.2, «Verificar»). Si el despliegue falla, Railway sigue sirviendo la versión anterior: el mensaje nombra la variable que falta.
6. **Prueba de humo** (§7.3), con los puntos 17 a 23.
7. **Después, conectar el repo de `inferencia` a `main`** (§5.4). Desde entonces se despliega solo, como `backend`.

**Los términos siguen en v1 con la v0.8.0** (decisión del usuario del 30/10): la v2 (#116) sale en una versión posterior, cuando la revise el asesor. Por eso la v0.8.0 no cambia `LEGAL_VERSION_TERMINOS` ni pide volver a aceptar. Cuando salga la v2, si producción estuviera con `MODERACION_TIPO=ninguna`, no se publica completa: se recorta el párrafo de la revisión de la foto o se retrasa (`project-context/decisions/plan-sprints.md`, S7).

**Ventana de los términos** (cuando salga la v2, no en la v0.8.0): si la PWA y el API no publican la versión de los términos a la vez, el registro responde 409 durante unos minutos (`plan-sprints.md`, S7).

### 10.2 Interruptores de emergencia

Cada uno se pone en Railway › `backend` › Variables y se aplica con *Deploy* normal. Mientras está puesto, cada arranque lo deja en el log: un WARN con `MODERACION_TIPO=ninguna` («Moderacion de fotos APAGADA») y con `ORIGEN_SECRETO=ninguno` («Encabezado de origen APAGADO»), y solo un INFO («Clasificador falso: …») con `CLASIFICACION_TIPO=falso`. Se anota aquí cuándo se puso y cuándo se quitó.

| Interruptor | Cuándo | Qué se pierde mientras está puesto |
|---|---|---|
| `CLASIFICACION_TIPO=falso` | La sugerencia molesta o carga al servicio de más. Nunca hace falta por una caída: una falla del servicio ya termina en «sin sugerencia». | La sugerencia de categoría. El falso de `prod` no sugiere ni escribe nada (`application-prod.yml`). |
| `MODERACION_TIPO=ninguna` | `inferencia` cae por un rato largo y los reportes con foto reciben 503. | **Se publican fotos sin revisar.** El filtro de texto sigue activo. Revisar después a mano las fotos de los reportes creados en ese lapso y ocultar lo que haga falta (§11.5). Si dura, avisar al usuario; cuando rijan los términos v2, además, prometen una revisión que no corre. |
| `ORIGEN_SECRETO=ninguno` | Hay que quitar el proxy de Cloudflare de `api` (nube gris) durante un incidente: sin proxy, el encabezado no llega y el API respondería 403 a todo. | El cierre del atajo de SEC-05: el API atiende también lo que no pasa por Cloudflare, sin su WAF ni su límite de peticiones. Al volver el proxy, se restaura el secreto (§11.4). |

## 11. Operación: defensas, límites de gasto y DNS

### 11.1 Defensas delante del API (25, 26 y 28/10; DEP-14 en la v0.8.0)

| Defensa | Qué hace | Cómo se verifica |
|---|---|---|
| **Sin dominio `*.up.railway.app` en `backend`** | Se borró el dominio generado de Railway, y §5.2, paso 5, pide no volver a generarlo. **Por sí solo no basta:** el borde de Railway enruta por `Host`, así que una petición con `Host: api.ciudadviva.app` enviada directo a la IP de Railway llegaba al backend sin pasar por Cloudflare (SEC-05, comprobado el 28/10). Lo cierra el encabezado de origen (fila siguiente y §11.4). | Railway › `backend` › Settings › Networking muestra solo el dominio propio. `curl -s -D - -o /dev/null $API/actuator/health` muestra `server: cloudflare`. |
| **Encabezado de origen (DEP-14, v0.8.0)** | Cloudflare agrega `X-Origen-Secreto` a cada petición a `api.ciudadviva.app`, y el backend responde 403 a lo que no lo trae con el valor correcto (salvo `GET /actuator/health`, el *health check* de Railway). Cierra el atajo de pedir directo a la IP de Railway, que se saltaba el WAF y el límite de peticiones (SEC-05). | Los `curl` de §11.4: directo, 403; por Cloudflare, 200. |
| **Regla WAF «API: solo rutas de la aplicación»** (28/10) | Una regla personalizada de Cloudflare (Security › WAF › Custom rules), con acción *Block*, sobre `api.ciudadviva.app`. Solo deja pasar `/api/`, `/media/fotos/reportes/`, `/actuator/health`, `/cdn-cgi/` y el desafío ACME, y bloquea lo que contenga `/.` o `.php`. **Una ruta nueva del backend fuera de `/api/` y `/media/fotos/reportes/` hay que agregarla a esta regla en el mismo despliegue**: si no, Cloudflare la bloquea antes de que llegue al API. | Cloudflare › Security › Events muestra los bloqueos. `curl -s -o /dev/null -w '%{http_code}\n' $API/.env` da 403 de Cloudflare. |
| **Límite de peticiones en Cloudflare** | Una regla de *rate limiting* (Security › WAF › Rate limiting rules) para las peticiones de escritura a `api.ciudadviva.app`: **30 cada 10 s por IP**, con **10 s de bloqueo**. El plan Free admite **una sola** regla de este tipo, y ya está usada: una regla nueva obliga a editar esta. El backend no limita por IP (§5.2), así que esta es la única defensa por IP contra ráfagas. El registro además exige captcha (Cloudflare Turnstile, NC-08b). | Cloudflare › Security › Events muestra los bloqueos. Ante un 429, la cola sin conexión reintenta los reportes encolados (US-06). Las demás escrituras (inicio de sesión, registro, adhesión, gestión) muestran el error y el usuario reintenta. |
| **`HEAD /actuator/health` responde 401** | `SecurityConfig` solo abre `GET` en esa ruta (rutas públicas exactas y solo `GET`). | **Un monitor externo tiene que usar `GET`:** con `HEAD` daría el servicio por caído. `curl -s $API/actuator/health` da `{"status":"UP"}` y `curl -sI $API/actuator/health` da 401. |

**Emergencia: quitar el proxy.** Si hubiera que quitar el proxy de Cloudflare de `api` (nube gris), el encabezado de origen deja de llegar y el API responde 403 a todo. Se pone `ORIGEN_SECRETO=ninguno` y se despliega (§10.2): el API acepta el tráfico directo, con un WARN en el log. Al volver el proxy, se restaura el secreto y se despliega.

**Si aparecen 429 legítimos.** Con el CGNAT de las redes móviles, varios usuarios pueden compartir una IP. A la escala de la tesis, 30 escrituras cada 10 s alcanzan. Si Security › Events muestra bloqueos de usuarios reales, se sube el umbral de esa misma regla y se anota aquí.

### 11.2 Límites de gasto de Railway

En Railway › Workspace › Usage:

| Límite | Valor | Qué pasa al alcanzarlo |
|---|---|---|
| **Compute: alerta** | US$ 15 | Railway manda un correo y los servicios siguen corriendo. |
| **Compute: límite duro** | US$ 25 | Railway **apaga todos los servicios** (`backend`, `postgis`, `respaldo-bd`, `inferencia`) hasta que se sube o se quita el límite. El sitio queda caído. |
| **Agent** | — | Es solo para las funciones de IA de Railway, **no para los servicios**. Se limita por separado del compute, y alcanzarlo no apaga los servicios. La documentación lo dice: «Compute and Agent usage are tracked and limited independently» y «Hitting the Agent hard limit disables the agent but leaves your workloads running» ([usage-limits](https://docs.railway.com/reference/usage-limits), 28/10/2026). |

Fuente: [docs.railway.com/reference/usage-limits](https://docs.railway.com/reference/usage-limits), consultada el 28/10/2026. El gasto esperado ronda los US$ 10–12 al mes con la inferencia y la moderación (estimación del plan del S7; el costo real del primer mes se anota aquí), así que el límite duro deja margen. Si se acerca a la alerta, revisar en Usage qué servicio crece antes de subir el límite.

### 11.3 Registros DNS que no se borran (Cloudflare, zona `ciudadviva.app`)

Detalle de cada registro en §3 (correo), §5.2 (`api`) y §6 (PWA).

| Registro | Para qué | Proxy |
|---|---|---|
| 3 `MX` en la raíz, SPF de la raíz, `TXT` en `cf2024-1._domainkey` | Email Routing: recibir en `contacto@`, `soporte@` y `dmarc@` (§3) | — |
| `TXT` en `_dmarc` | DMARC único del dominio (§3) | — |
| `TXT` en `resend._domainkey`; `MX` y `TXT` en `send` | Resend: DKIM y SPF del envío (§3) | — |
| **`CNAME` en `rsend` → `send.forge.rmta.net`** | **Parte de la verificación de Resend del 25/10** (§3, paso 1). No se borra aunque ningún servicio propio lo use: de Resend depende todo el correo saliente, incluida la confirmación de la cuenta (NC-09) | **Sin proxy** (nube gris) |
| `CNAME` en `api` y `TXT` en `_railway-verify.api` | Dominio propio del API en Railway (§5.2) | `api` **con proxy** |
| `A` en la raíz y `CNAME` en `www` | PWA en Vercel (§6) | Sin proxy |

**Antes de borrar o cambiar un registro de la zona,** buscarlo en esta tabla. Si no está, averiguar quién lo creó antes de tocarlo.

### 11.4 Encabezado de origen (DEP-14)

El API solo atiende lo que pasa por Cloudflare: sin `X-Origen-Secreto` con el secreto correcto, responde 403 en cualquier ruta salvo `GET /actuator/health` (el *health check* de Railway). **La v0.8.0 no arranca sin `ORIGEN_SECRETO`.** Diseño, pruebas y alternativas descartadas: `backend/README.md`, «Encabezado de origen (DEP-14)».

**Activación** (una vez, antes de publicar la v0.8.0; el orden importa):

1. **Generar el secreto** en la máquina del usuario con `openssl rand -hex 32` y guardarlo en el gestor de contraseñas. Nunca va al chat, a un commit ni a un archivo del repo.
2. **Regla en Cloudflare:** zona `ciudadviva.app` › Rules › Overview › Create rule › *Request Header Transform Rule*.
   - Nombre: `Encabezado de origen (DEP-14)`.
   - Condición: *Custom filter expression* `http.host eq "api.ciudadviva.app"`.
   - Acción **Set static**: nombre `X-Origen-Secreto`, valor el secreto. *Set static* reemplaza el valor si un cliente manda el suyo.
   - *Deploy*. La versión actual del API ignora el encabezado, así que este paso no cambia nada todavía.
3. **Railway:** `backend` › Variables › `ORIGEN_SECRETO` = el mismo valor, sin sellar (§0). Guardar con **Alt + Deploy**, que no redespliega.
4. **Desplegar la v0.8.0** (§10.1, paso 5).
   - Log esperado: «Encabezado de origen exigido (DEP-14): sin X-Origen-Secreto valido, 403; solo queda exento GET /actuator/health.»
   - Si el despliegue falla con `Could not resolve placeholder 'ORIGEN_SECRETO'` o `ORIGEN_SECRETO es demasiado corto`, falta la variable o es inválida. Railway sigue sirviendo la versión anterior.
   - Si se invierte el orden (variable y despliegue antes que la regla), el API responde 403 a todo hasta que exista la regla.

**Verificación:**

```bash
API=https://api.ciudadviva.app
# IP del borde de Railway: el destino del CNAME `api` (Cloudflare › DNS › api)
nslookup <id>.up.railway.app
IP=<una de esas IP>
curl -s -o /dev/null -w '%{http_code}\n' --resolve api.ciudadviva.app:443:$IP $API/api/categorias   # 403
curl -s --resolve api.ciudadviva.app:443:$IP $API/actuator/health                                 # {"status":"UP"}
curl -s -o /dev/null -w '%{http_code}\n' $API/api/categorias                                       # 200 (por Cloudflare)
```

Si `curl --resolve` rechaza el certificado, agregar `-k` solo en esta prueba. Después, la prueba de humo de §7.3.

**Rotación:** §9, fila `ORIGEN_SECRETO`. **Emergencia sin proxy:** §11.1 y §10.2.

### 11.5 Moderación del contenido publicado (NC-10, NC-11)

La moderación automática rechaza antes de publicar (NC-10b). Lo que ya está publicado lo oculta el ADMIN desde la bandeja de moderación de la PWA (NC-11): el reporte entero o solo su foto, siempre con un motivo, que queda en la línea de tiempo. Las denuncias de los ciudadanos no ocultan nada solas. Detalle: `backend/README.md`, «Ocultar y denunciar».

**Purga manual de una foto oculta en Cloudflare.** Al ocultar una foto (o el reporte entero), el API deja de servirla al instante (404). Pero la foto de reporte lleva `s-maxage=3600`, así que el borde de Cloudflare puede seguir entregando su copia **hasta 1 hora**. Si el caso es urgente:

1. Armar la URL completa de la foto: `https://api.ciudadviva.app` seguido de su `foto_url`. Las respuestas del ADMIN no traen esa URL (la PWA le muestra la foto por su ruta propia), así que se lee de la base: `railway connect postgis` y `SELECT foto_url FROM reporte WHERE id = <id>;` (da `/media/fotos/reportes/<archivo>`).
2. Cloudflare › zona `ciudadviva.app` › Caching › Configuration › **Purge Cache** › **Custom Purge** › *Purge by* **URL** › pegar la URL › *Purge* ([purga por URL](https://developers.cloudflare.com/cache/how-to/purge-cache/purge-by-single-file/), disponible en todos los planes desde abril de 2025; consultado el 30/10/2026).
3. **Verificar:** `curl -sI <URL>` da 404 y `cf-cache-status` no es `HIT`. Si sigue en `HIT`, purgar por *Prefix* con la misma URL: la purga por URL desde el panel no limpia una copia que se guardó con ciertos encabezados de la petición (por ejemplo `Origin`).

Lo que el navegador de una persona ya descargó (30 días de `max-age`) no se puede retirar.

**Procedimiento ante material ilegal** (por ejemplo, contenido sexual de menores). **Pendiente de confirmar con el asesor** antes de abrir a usuarios reales (`plan-sprints.md`, S7). La propuesta es:

1. **Ocultar** el reporte entero de inmediato desde la bandeja de moderación, con un motivo que no describa el contenido, y purgar la foto en Cloudflare (arriba).
2. **Conservar en privado:** no borrar el objeto de R2 ni el reporte. El ADMIN es el único que puede ver la foto oculta. No descargarla, copiarla ni reenviarla.
3. **Denunciar** ante la **DIVINDAT** (División de Investigación de Delitos de Alta Tecnología de la Policía Nacional) o ante el **Ministerio Público**, con la fecha, el identificador del reporte y lo que pidan las autoridades.
4. **Registrar** el caso como un incidente (§9): qué pasó, cuándo se supo y qué se hizo.

Hasta que el asesor lo confirme, este procedimiento no está aprobado.

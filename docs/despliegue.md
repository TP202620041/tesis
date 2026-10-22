# Despliegue de Ciudad Viva (runbook)

> Procedimiento para desplegar el MVP en **Railway** (API + PostGIS + respaldo), **Vercel** (PWA), **Cloudflare R2** (fotos y respaldos) y un **proveedor de correo HTTP**. Diseño, opciones y fuentes: `project-context/decisions/propuestas/2026-10-21-despliegue-mvp.md` (estado: **abierta**). Diagrama: `docs/arquitectura/c4-despliegue.md`.
>
> Versión 0.1 · 2026-10-21 · Redactado antes del primer despliegue real: lo marcado **(verificar)** se confirma en esa primera ejecución (DEP-09) y se corrige aquí.

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

En los comandos, `$API` es la URL pública del API (`https://<algo>.up.railway.app`) y `$PWA` la de la PWA (`https://<algo>.vercel.app`).

## 1. Cuentas

| Cuenta | Plan | Quién | Nota |
|---|---|---|---|
| GitHub (`TP202620041/tesis`) | — | ya existe | El repo es público: Vercel Hobby puede desplegarlo. Si pasa a privado, Hobby ya no puede (fuente en la propuesta). |
| Railway | **Hobby** (US$ 5/mes con US$ 5 de uso) | dueño del proyecto | El plan Free no alcanza (0,5 GB por servicio). |
| Vercel | **Hobby** | dueño del proyecto, con login de GitHub | Uso no comercial. |
| Cloudflare | Free, con **R2 activado** | dueño del proyecto | Activar R2 pide completar un *checkout* (verificar si pide tarjeta). |
| Brevo (o Resend) | Free | dueño del proyecto | Según la decisión de la propuesta de correo. |

## 2. Cloudflare R2

1. **Buckets** (R2 › Create bucket), los tres **privados**, *location hint* **Eastern North America (`enam`)**, sin jurisdicción:
   - `ciudadviva-fotos-reportes`
   - `ciudadviva-fotos-perfiles`
   - `ciudadviva-respaldos`
2. **Ciclo de vida de los respaldos:** en `ciudadviva-respaldos` › Settings › Object Lifecycle Rules › Add rule: borrar objetos de más de **30 días**.
3. **Tokens** (R2 › Manage API tokens › Create API token), con permiso **Object Read & Write** y limitados a buckets concretos:
   - token **fotos**: solo `ciudadviva-fotos-reportes` y `ciudadviva-fotos-perfiles`;
   - token **respaldos**: solo `ciudadviva-respaldos`.

   Cada token muestra un *Access Key ID* y un *Secret Access Key* **una sola vez**: guardarlos en el gestor de contraseñas.
4. Anotar el **endpoint S3**: `https://<ACCOUNT_ID>.r2.cloudflarestorage.com` (R2 › Overview).

**Verificar:** los tres buckets aparecen como privados (sin `r2.dev` público ni dominio conectado).

## 3. Correo

**Decisión del usuario (21/10): Resend.** Resend exige un **dominio propio verificado**: sin él solo envía a la cuenta del dueño. Mientras no haya dominio, el despliegue puede salir con el correo limitado a las direcciones del equipo. Las instrucciones de Brevo quedan como alternativa.

Con **Brevo** (alternativa):

1. Senders, Domains & Dedicated IPs › Senders: agregar el remitente y verificarlo con el código que llega por correo. Con dominio propio: Domains › autenticar el dominio con los registros SPF, DKIM y DMARC que indica Brevo.
2. **Seguridad › IPs autorizadas: desactivar el bloqueo de IP desconocidas.** Railway Hobby no tiene IP de salida fija; con el bloqueo activo, los envíos se cortan sin aviso.
3. SMTP & API › API Keys › generar una clave → será `CORREO_API_KEY`.

**Verificar** (desde la máquina local, con la clave en una variable de la terminal y nunca escrita en un archivo):

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://api.brevo.com/v3/smtp/email \
  -H "api-key: $CORREO_API_KEY" -H "content-type: application/json" \
  -d '{"sender":{"email":"<remitente verificado>"},"to":[{"email":"<tu correo>"}],"subject":"Prueba Ciudad Viva","textContent":"Prueba de despliegue"}'
# 201 y el correo llega (revisar también la carpeta de spam)
```

Con **Resend**: verificar el dominio (SPF y DKIM, DMARC recomendado), crear la clave y probar con `POST https://api.resend.com/emails` (requiere cabecera `User-Agent`).

## 4. Secretos que se generan una vez

| Secreto | Cómo | Dónde va |
|---|---|---|
| `JWT_SECRET` | `openssl rand -base64 48` | `backend` |
| `POSTGRES_PASSWORD` | `openssl rand -base64 32 \| tr -d '/+='` | `postgis` |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | `npx web-push generate-vapid-keys` (**un par nuevo**, no el de desarrollo) | `backend` |

## 5. Railway

Crear un proyecto («Ciudad Viva», entorno `production`). Región de cada servicio: **US East (Virginia)** (Settings › Deploy › Regions); no hay región en Sudamérica.

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
3. **Settings › Build › Watch Paths:** `/backend/**` (las rutas parten de la raíz del repo aunque haya *Root Directory*), para que un cambio en `frontend/` o `docs/` no redespliegue el API.
4. **Settings › Deploy:** *Healthcheck Path* `/actuator/health` (el tiempo de espera por defecto, 300 s, alcanza); *Restart Policy* `On Failure`. Railway solo consulta el health check al desplegar, para cambiar de versión sin corte; no lo vigila después.
5. **Networking › Generate Domain:** anotar la URL → `$API`.
6. **Variables** (con «Add Reference» para las de `postgis`):

   | Variable | Valor |
   |---|---|
   | `SPRING_PROFILES_ACTIVE` | `prod` |
   | `DB_URL` | `jdbc:postgresql://${{postgis.RAILWAY_PRIVATE_DOMAIN}}:5432/${{postgis.POSTGRES_DB}}` |
   | `DB_USERNAME` | `${{postgis.POSTGRES_USER}}` |
   | `DB_PASSWORD` | `${{postgis.POSTGRES_PASSWORD}}` |
   | `JWT_SECRET` | §4 |
   | `JWT_EXPIRATION_MINUTES` | `120` |
   | `CORS_ALLOWED_ORIGINS` | `$PWA` (se completa en §6; mientras tanto, `http://localhost:3000`) |
   | `NOTIF_FROM` | `Ciudad Viva <remitente verificado en §3>` |
   | `CORREO_TIPO` | `resend` (decisión del 21/10) |
   | `CORREO_API_KEY` | §3 |
   | `FOTOS_ALMACEN` | `s3` |
   | `FOTOS_S3_ENDPOINT` | endpoint de §2 |
   | `FOTOS_S3_REGION` | `auto` |
   | `FOTOS_S3_BUCKET_REPORTES` | `ciudadviva-fotos-reportes` |
   | `FOTOS_S3_BUCKET_PERFILES` | `ciudadviva-fotos-perfiles` |
   | `FOTOS_S3_ACCESS_KEY_ID` / `FOTOS_S3_SECRET_ACCESS_KEY` | token **fotos** de §2 |
   | `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | §4 |
   | `VAPID_SUBJECT` | `mailto:<correo de contacto real del proyecto>` |
   | `JAVA_TOOL_OPTIONS` | `-Xms256m -Xmx512m -XX:+UseSerialGC -XX:+ExitOnOutOfMemoryError` |
   | `SPRINGDOC_HABILITADO` | sin definir (Swagger apagado); `true` solo para una demo y después se quita |

   **Mientras DEP-12 (fotos en R2) no esté en `main`**, las fotos van a disco. En ese caso:
   - no se definen las variables `FOTOS_ALMACEN` ni `FOTOS_S3_*`;
   - se monta un *volume* en `/data` y se define `FOTOS_DIR=/data/fotos`;
   - se agrega `RAILWAY_RUN_UID=0`, porque el volumen se monta como root y la imagen corre sin privilegios (uid 10001). Esto hace correr el contenedor **como root**. Es temporal: se quita junto con el volumen cuando DEP-12 llega a producción (`backend/README.md`, «Configuración de producción»).

   `PORT` lo inyecta Railway. El heap de 512 MB está medido para el saneado de fotos de DEP-12 (decodificación submuestreada y como máximo 2 saneados simultáneos); si los logs muestran `OutOfMemoryError`, subir a `-Xmx768m` y avisar para revisar el límite de saneados. Los nombres definitivos de `CORREO_*` y `FOTOS_S3_*` los fijan DEP-08 y DEP-12: si cambian, se actualiza esta tabla.

**Verificar** (logs del primer despliegue y luego `curl`):

```bash
railway logs --service backend
#  - Flyway: "Successfully applied N migrations" en la primera corrida (todas las V*.sql; 17 en v0.6.0)
#  - DistritoSeeder: 43 distritos; MunicipalidadSeeder: 43 municipalidades
#  - "Started ViaSeguraApplication"; ninguna línea con "show-sql" ni DEBUG
curl -s $API/actuator/health                       # {"status":"UP"} y nada más
curl -s $API/api/distritos | grep -o '"id"' | wc -l   # 43
curl -s -o /dev/null -w "%{http_code}\n" $API/actuator/env         # distinto de 200
curl -s -o /dev/null -w "%{http_code}\n" $API/v3/api-docs          # distinto de 200 (Swagger apagado)
```

### 5.3 Servicio `respaldo-bd`

1. New › **Template** › «Postgres S3 Backups» (`railwayapp-templates/postgres-s3-backups`). Renombrar a `respaldo-bd`.
2. **Variables:**

   | Variable | Valor |
   |---|---|
   | `BACKUP_DATABASE_URL` | `postgresql://${{postgis.POSTGRES_USER}}:${{postgis.POSTGRES_PASSWORD}}@${{postgis.RAILWAY_PRIVATE_DOMAIN}}:5432/${{postgis.POSTGRES_DB}}` |
   | `AWS_S3_ENDPOINT` | endpoint de §2 |
   | `AWS_S3_REGION` | `auto` |
   | `AWS_S3_BUCKET` | `ciudadviva-respaldos` |
   | `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | token **respaldos** de §2 |
   | `SINGLE_SHOT_MODE` | `true` |
   | `PG_VERSION` | `16` |
   | `BACKUP_FILE_PREFIX` | `ciudadviva` |

3. **Settings › Deploy › Cron Schedule:** `0 8 * * *` (08:00 UTC = 03:00 en Lima). El cron de Railway corre en UTC, con un mínimo de 5 minutos entre corridas, y el proceso debe terminar al acabar (por eso `SINGLE_SHOT_MODE`).

**Verificar:** `railway cron run --service respaldo-bd` (o esperar a la primera corrida) y comprobar que aparece un objeto `ciudadviva…` en `ciudadviva-respaldos` con un tamaño razonable (verificar el formato del volcado, que necesita §8).

Si el plan de Railway incluye respaldos del volumen (en el servicio `postgis` › Backups), activar también el diario y el semanal (verificar disponibilidad en Hobby).

## 6. Vercel

1. Add New › Project › importar `TP202620041/tesis`.
2. **Root Directory:** `frontend`. Framework: Next.js (detectado). Build command: el de `package.json` (`npm run build`, que también compila el Service Worker). Node: lo fija `engines.node` (24.x).
3. **Environment Variables › Production:** `NEXT_PUBLIC_API_BASE_URL` = `$API` (sin barra final). Se hornea en el build y en la CSP: cambiarla exige redesplegar.
4. Deploy. Anotar la URL de producción → `$PWA`.
5. **Settings › Git:** *Production Branch* `main`. *Ignored Build Step*: preset **«Only build production»** (sin previews: cada preview tendría otro origen, que el CORS del API rechaza, y usaría la base de producción).
6. Volver a Railway › `backend` › Variables: `CORS_ALLOWED_ORIGINS` = `$PWA` (exacto, con `https://` y sin barra final). Railway redespliega.

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

## 8. Respaldo y restauración

**Prueba de restauración** (una vez al mes y antes de cada release), en la máquina local con el `docker compose` de `backend/`:

```bash
# 1. Descargar el último volcado de ciudadviva-respaldos (panel de R2 › objeto › Download).
# 2. Base vacía en el PostGIS local
docker exec viasegura-db psql -U viasegura -d viasegura -c "CREATE DATABASE restaurada;"
# 3. Restaurar según el formato que genera la plantilla (verificar en el primer respaldo):
#    formato custom o tar:
docker exec -i viasegura-db pg_restore -U viasegura -d restaurada --no-owner --no-acl < volcado.dump
#    SQL plano comprimido:
gunzip -c volcado.sql.gz | docker exec -i viasegura-db psql -U viasegura -d restaurada -v ON_ERROR_STOP=1
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
| `POSTGRES_PASSWORD` | `railway connect postgis` → `ALTER ROLE viasegura WITH PASSWORD '<nuevo>';` (sin dejarlo en el historial de la terminal), actualizar la variable en `postgis` y redesplegar `backend` y `respaldo-bd` (usan la referencia). | Corte breve del API. |
| Tokens R2 (fotos, respaldos) | Crear un token nuevo con el mismo alcance, reemplazar las variables, redesplegar y **después** revocar el viejo. | Ninguno. |
| `CORREO_API_KEY` | Igual: clave nueva, redesplegar, revocar la vieja. | Ninguno. |
| Claves VAPID | **Solo si se comprometió la privada.** Par nuevo, redesplegar. | Todas las suscripciones push dejan de servir; cada usuario vuelve a suscribirse al iniciar sesión. |

**Incidente de seguridad** (por ejemplo, un secreto filtrado o un acceso indebido a datos):

1. Rotar lo comprometido (tabla de arriba) y revisar los logs (`railway logs`).
2. Registrar el incidente por escrito (qué pasó, cuándo se supo, qué datos y cuántas personas, qué se hizo), aunque no haya que notificarlo (DS 016-2024-JUS, art. 35).
3. Si expone datos personales en volumen o puede perjudicar a las personas, **notificar a la ANPD y a los afectados en 48 h** desde que se supo (art. 34). Quién lo hace lo decide el usuario (decisiones pendientes, §7).

## 10. Publicar una versión nueva y volver atrás

- **Publicar:** al fusionar el PR de `release/vX.Y.0` en `main`, Railway reconstruye `backend` y Vercel reconstruye la PWA, en paralelo. Por eso cada cambio del API tiene que ser **compatible con la PWA anterior durante una versión** (propuesta de despliegue, riesgo 1). Si una versión no puede cumplirlo, desactivar antes en Vercel la asignación automática del dominio de producción y promover el despliegue a mano cuando el API ya esté arriba (verificar el nombre exacto de la opción).
- **Después de publicar:** prueba de humo (§7.3).
- **Volver atrás:** Railway › `backend` › Deployments › el anterior › *Redeploy*; Vercel › Deployments › el anterior › *Instant Rollback* (en Hobby, verificar hasta cuántas versiones atrás). Las migraciones de Flyway no se deshacen: una versión vieja arranca sobre un esquema más nuevo solo si las migraciones fueron aditivas (columnas nulables, tablas nuevas). Nunca restaurar un respaldo para «deshacer» una migración sin antes medir cuántos datos se perderían.

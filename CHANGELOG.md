# Cambios

Versiones de Ciudad Viva (antes ViaSegura) según GitFlow (`WORKFLOW.md` §8): cada sprint cierra con una versión minor en `main`. Plan: `project-context/decisions/plan-sprints.md`.

## v0.8.0 — Sprint 7: ML real, registro verificado y moderación (2026-10-31)

Cierra el S7, que salió antes que el S6 por decisión del usuario del 25/10 (`project-context/decisions/plan-sprints.md`). Reúne los PR #108, #109, #112 y #115 a #141, fusionados en `develop` después de v0.7.2:
- la sugerencia de categoría con el modelo real (RF-DETR Nano) en un servicio nuevo, `inferencia/`;
- el registro con captcha y confirmación del correo, y la purga de las cuentas que nunca se confirman;
- la moderación de fotos y textos, y que el ADMIN pueda ocultar lo publicado y los ciudadanos denunciarlo;
- el API solo atiende lo que pasa por Cloudflare.

**Los términos siguen en v1** (decisión del usuario del 30/10). La v2 (#116), con el aviso del análisis automático de la foto, la revisión del contenido, la atribución de RDD2022 y de los pesos, y los plazos de BE-13 y BE-14, sale en una versión posterior, cuando la revise el asesor. Esta versión no cambia `LEGAL_VERSION_TERMINOS` ni pide volver a aceptar. Mientras tanto, la PWA avisa del análisis automático junto al campo de la foto (#117).

### ⚠️ Antes de publicar: cambios incompatibles y variables nuevas
La v0.8.0 **no arranca en `prod`** sin variables nuevas, y el `backend` con la moderación en `http` no puede llegar antes que el servicio que modera. Todo se hace **antes de fusionar en `main`**, en el orden de `docs/despliegue.md` §10.1:
1. subir `inferencia` a Railway con NC-10a y comprobar que `/salud` devuelve `version_moderacion` (§5.4, DEP-13);
2. crear en Cloudflare la *Transform Rule* de `X-Origen-Secreto` (§11.4) y el widget de Turnstile (§5.2);
3. cargar las variables con *Alt + Deploy*.

**Variables obligatorias nuevas del `backend` en `prod`** (sin ellas, o con un valor no admitido, la app no arranca):

| Variable | Valor en producción | Tarea |
|---|---|---|
| `CLASIFICACION_TIPO` | `http` (`falso` es el interruptor de apagado) | NC-04b |
| `CLASIFICACION_URL` | la URL privada de `inferencia`, solo la base | NC-04b |
| `MODERACION_TIPO` | `http` (`ninguna` publica fotos sin revisar) | NC-10b |
| `MODERACION_URL` | la misma URL privada de `inferencia` | NC-10b |
| `CAPTCHA_TIPO` | `turnstile` (`recaptcha` ya no arranca) | NC-08b |
| `CAPTCHA_SECRET` | la clave secreta del widget de Turnstile | NC-08b |
| `ORIGEN_SECRETO` | el valor de la *Transform Rule*, de al menos 32 caracteres; primero la regla y después la variable | DEP-14 |

**En Vercel:** `NEXT_PUBLIC_TURNSTILE_SITE_KEY` reemplaza a `NEXT_PUBLIC_RECAPTCHA_SITE_KEY`. Sin ella, el build de producción falla.

**Pool de conexiones:** `SPRING_DATASOURCE_HIKARI_MAXIMUMPOOLSIZE` vuelve de 20 a **10** (decisión del usuario del 30/10, por BE-12), en el mismo paso que las demás variables.

**Opcionales nuevas** (con valor por defecto): `FRONTEND_URL` (recomendada), `DOMINIO_CORREO_TIPO`, `CAPTCHA_HOSTNAMES`, `CLASIFICACION_UMBRAL`, `CLASIFICACION_ESPERA_TURNO_MS`, `ASYNC_SUGERENCIAS_HILOS`, `MODERACION_UMBRAL`, `ORIGEN_SECRETO_ANTERIOR`, `CUENTAS_SIN_CONFIRMAR_PLAZO` y `CUENTAS_SIN_CONFIRMAR_PURGA_CRON`.

**Cambios incompatibles del contrato y del comportamiento:**
- **Registro sin sesión (NC-09):** `POST /api/auth/registro` responde 201 `RegistroResponse {email, vigenciaEnlaceHoras}` en lugar de `AuthResponse`. La PWA de esta versión lo atiende; la anterior no, y tampoco envía el captcha, así que entre el despliegue del API y el de la PWA el registro desde la PWA vieja no funciona (runbook §10, compatibilidad durante una versión). El login de una cuenta sin confirmar responde 409 `CORREO_NO_CONFIRMADO`. Las cuentas que ya existían quedan confirmadas (V20).
- **Captcha obligatorio en `prod`:** el registro sin `captchaToken` válido responde 409, y 503 si Cloudflare no responde.
- **Moderación:** 400 `FOTO_NO_PERMITIDA` y `TEXTO_NO_PERMITIDO`, y 503 `MODERACION_NO_DISPONIBLE` al crear un reporte con foto si el servicio no responde (falla cerrada).
- **Reportes ocultos:** un reporte oculto da 404 en el detalle y sale de la búsqueda, el mapa, la bandeja municipal, la exportación y el índice. Solo lo ven el ADMIN y su creador, en «Mis reportes». Una foto oculta llega como `fotoUrl: null`, y `/media` responde 404.
- **Origen:** una petición que no pasa por Cloudflare recibe 403, salvo `GET /actuator/health`.
- **Adhesión con foto (BE-11):** un archivo que no es imagen responde 409 en vez de descartarse, y 503 si no hay turno para sanear o R2 no responde.
- **Categorías:** V19 desactiva «Hueco en calzada»; los reportes que ya la usan no cambian.
- **Migraciones:** V19, V20 y V21; Flyway aplica las tres al pasar de v0.7.x. V21 rehace `mv_indice_desempeno_distrital` para excluir los reportes ocultos. Volver a una v0.7.x sobre este esquema no está probado (runbook §10).

### ML real
- **NC-03a · Servicio de inferencia** (#109): `inferencia/`, con FastAPI y ONNX en CPU.
  - **Modelo:** RF-DETR Nano entrenado en RDD2022, con las clases `bache` y `grieta`. Pesos Apache-2.0; la exportación es reproducible byte a byte y el Dockerfile falla si el sha256 no coincide.
  - **Contrato:** `POST /v1/detecciones` y `GET /salud`. El servicio solo detecta; el umbral de 0,50 lo aplica el backend.
  - **Capas:** las de ARCHITECTURE §6, con import-linter. Dependencias con hashes y telemetría de onnxruntime apagada.
  - **CI:** job `inferencia` con guarda de completitud.
- **NC-04 · Sugerencia de categoría** (#108 backend, #117 PWA):
  - **Módulo `clasificacion`:** el puerto `ClasificadorDano` y `PoliticaDeSugerencia`.
  - **Vista previa:** `POST /api/clasificaciones` sanea la foto y no guarda nada. La PWA **propone** la categoría con un botón y no la preselecciona, para que la decisión sea del ciudadano.
  - **Sugerencia oficial:** asíncrona después del commit (D-08 con el patrón de D-13). Es una señal interna: ningún DTO la expone.
  - **V19:** `clase_modelo` en las categorías, las tres columnas de la sugerencia en `reporte`, y «Hueco en calzada» desactivada.
- **NC-04b · El modelo real en el backend** (#118): `InferenciaHttpAdapter`, con 3 s como máximo, *bulkhead* de 4 turnos y «sin sugerencia» ante cualquier falla. `CLASIFICACION_TIPO` pasa a ser obligatoria en `prod`.
- **NC-04c · La sugerencia oficial espera turno** (#126): hasta 10 s, en un executor propio de 2 hilos. La vista previa sigue sin esperar.
- **DEP-13 · El servicio en Railway** (#115, #139): 2 vCPU y 1 GB, solo por la red privada, con healthcheck `/salud`. Runbook §5.4. El repo de `inferencia` se conecta a `main` al publicar esta versión.

### Registro
- **NC-08 y NC-08b · Captcha** (#119 y #120; #132 y #131): primero reCAPTCHA v2 y, por decisión del usuario del 28/10, **Cloudflare Turnstile**. reCAPTCHA no llegó a producción.
  - **Backend:** el puerto `VerificadorDeCaptcha`, con la verificación antes que las demás comprobaciones y fuera de la transacción. Valida el *hostname* (`CAPTCHA_HOSTNAMES`) y no envía la IP.
  - **PWA:** el widget en español, que se reinicia tras cada error. La CSP solo suma `challenges.cloudflare.com`, y el Service Worker no lo cachea.
- **NC-09 · Confirmación del correo** (#122 backend, #123 PWA):
  - **Antes de crear la cuenta:** rechaza los dominios sin MX y los desechables. Si el DNS falla, acepta.
  - **Enlace:** vale 24 h y la base guarda solo su hash. Sale por `CorreoSaliente`, después del commit.
  - **Reenvío:** siempre 202, con topes por cuenta.
  - **PWA:** «Revisa tu correo» al registrarse; `/confirmar-cuenta` quita el token de la URL y no se cachea.
  - **V20:** `usuario.correo_confirmado` y la tabla `token_confirmacion_correo`.
- **NC-09b · Cuentas sin confirmar** (#125): no recuperan la contraseña, y `asignar-funcionario.sql` exige la cuenta confirmada.
- **NC-09c · Reenviar desde «¿Olvidaste tu contraseña?»** (#127): un aviso que se muestra siempre, así que no revela si la cuenta existe.
- **BE-15 · Purga de las cuentas sin confirmar** (#141): una vez al día borra los ciudadanos que no confirmaron en 30 días y no tienen un enlace vigente, junto con sus consentimientos (opción A, aceptada el 31/10). Cada cuenta va en su propia transacción; si la confirmación coincide con la purga, gana la confirmación. Es la primera tarea programada del backend (ARCHITECTURE §4.5).

### Moderación
- **Propuesta y D-15** (#121): decisiones del usuario del 28/10. La foto se analiza en nuestro servicio, sin terceros; la moderación falla cerrada; el ADMIN oculta y los ciudadanos denuncian.
- **NC-10a · Moderación en `inferencia/`** (#129, #133): `POST /v1/moderacion` con Marqo `nsfw-image-detection-384` (Apache-2.0), exportado de forma reproducible. El tope de la foto baja de 16 a 8 MP y la RAM queda en ~505 MiB con los dos modelos.
- **NC-10b · Moderación en el backend** (#134): módulo `moderacion`.
  - **Foto:** umbral 0,70; se revisa ya saneada, sin transacción y antes de subirla. La sugerencia oficial no se modera.
  - **Texto:** una lista propia de groserías (153 entradas, versión `2026-10-29.1`), por palabra o expresión entera, nunca por subcadena. Revisa título, descripción, comentarios, y nombre y apellido del perfil.
  - **Vista previa:** `ClasificacionResponse.fotoRechazada`. Ningún DTO expone el puntaje.
- **NC-10c · Moderación en la PWA** (#135): avisos por campo que no repiten la palabra; ante un 503, «Guardar para enviar después» o «Enviar sin foto» con la misma `Idempotency-Key`; la cola sin conexión distingue el rechazo de la falta de servicio.
- **NC-11a · Ocultar y denunciar** (#136):
  - **Denuncias:** `POST /api/reportes/{id}/denuncias`, una por reporte y hasta 10 por día. No tienen efecto automático (SEC-01).
  - **Bandeja del ADMIN:** `/api/admin/moderacion/reportes`, para ocultar o restablecer el reporte o su foto con un motivo que queda en la línea de tiempo, y desestimar.
  - **V21:** `reporte.oculto`, `reporte.foto_oculta`, la tabla `denuncia_reporte` y el índice sin los reportes ocultos.
  - **Fotos:** el *resource handler* pasa a `reportes/infra/FotosDeReporteWebConfig`, con `s-maxage=3600`.
- **NC-11a2 · Filtro «ocultos»** (#137): la bandeja del ADMIN lista lo que ocultó, tenga denuncias o no, ordenado por el último ocultamiento.
- **NC-11b · Denuncias y moderación en la PWA** (#138): «Denunciar contenido» en el detalle, el aviso al creador, los eventos nuevos en la línea de tiempo, y `/admin/moderacion` con las vistas Pendientes, Atendidas, Desestimadas y Ocultos.
- **Pendiente antes de abrir a usuarios reales:** que el asesor confirme el procedimiento ante material ilegal (runbook §11.5).

### Seguridad
- **DEP-14 · Encabezado de origen** (#130): cierra SEC-05, el atajo de pedir directo a la IP de Railway saltándose el WAF y el límite de peticiones.
  - **Filtro:** `common/security/EncabezadoDeOrigenFilter`, antes que Spring Security, compara `X-Origen-Secreto` en tiempo constante y responde 403 sin pistas.
  - **Rotación:** `ORIGEN_SECRETO_ANTERIOR`, sin corte.
  - **Interruptor:** `ORIGEN_SECRETO=ninguno`, con un WARN en cada arranque.
- **Configuración de Cloudflare** (runbook §11, #124 y #139):
  - la *Transform Rule* que agrega el encabezado;
  - la regla WAF «solo rutas de la aplicación»;
  - el límite de 30 escrituras cada 10 s por IP, la única regla de *rate limit* del plan Free;
  - el dominio `*.up.railway.app` del API, borrado;
  - la purga manual de la caché para una foto oculta con urgencia.

### Robustez
- **BE-11 · La foto fuera de la transacción** (#128): `ReporteService#crear` sanea y sube la foto sin retener una conexión del pool, abre después una transacción programática y borra la foto si ningún reporte la usa (`FotoProvisional`). Es el patrón de ARCHITECTURE §4.5 que usa la moderación.
- **BE-12 · Refresco asíncrono y coalescido del índice** (#140): el índice se refresca en un executor de un hilo, a lo sumo uno en curso y otro pendiente, con una sola conexión. Con la imagen `prod` y el pool en 10, 16 creaciones simultáneas con fotos de 24 a 40 MP dieron 16 × 201. Cierra la propuesta del 22/10 (#97).

### Documentación y decisiones
- **Decisiones del 25/10** (#112): el primer ADMIN es la cuenta del usuario; producción sin datos falsos; *previews* de Vercel y Swagger apagados; pool en 20 hasta BE-12.
- **El modelo real entra al S7** (#115): NC-04b y DEP-13, con el costo estimado.
- **Runbook** (`docs/despliegue.md`):
  - **v0.3 y v0.4** (#124, #139): la operación (§11), el servicio `inferencia` (§5.4), las variables nuevas (§5.2), el orden de publicación (§10.1), los interruptores (§10.2) y la prueba de humo con los puntos 17 a 23;
  - **v0.5, en esta release:** el pool en 10, las variables de BE-15 y los términos en v1.
- **ARCHITECTURE.md:**
  - **v1.7** (#139 y BE-12): §4.5 con el I/O externo antes de escribir (BE-11) y el refresco coalescido del índice, D-13 y D-15;
  - **v1.8, en esta release:** §4.5 con las tareas programadas (BE-15).
- **Diagramas C4** (#139): `inferencia` en servicio, Turnstile y DEP-14.
- **Plan:** el S7 cerrado, con los términos v2 (#116, con BE-13 y BE-14) y NC-03b como pendientes.

### Cifras
| Métrica | v0.7.2 | v0.8.0 |
|---|---|---|
| Tests de integración backend (Failsafe `completed`) | 418 | 612 (598 ejecutados y 14 omitidos) |
| Tests unitarios backend (Surefire) | 230 | 830 |
| Violaciones congeladas de ArchUnit | 0 | 0 |
| Cobertura del backend (JaCoCo, líneas / ramas) | 93,4 % / 80,5 % | 95,8 % / 87,2 % |
| Tests frontend (archivos) | 1041 (121) | 1420 (152) |
| Avisos de capas frontend | 0 | 0 |
| Tests de `inferencia/` sin pesos | — | 264 (9 omitidos, los del modelo real) |

Las cifras del backend son las de la CI de `develop` (run 41241532191, sobre #141), con S3Mock. Los 14 omitidos son los IT contra el servicio `inferencia` real (`InferenciaHttpAdapterIT` e `InferenciaModeracionHttpAdapterIT`), que se activan con su variable. Los mínimos de la guarda de la CI suben a 598 (Failsafe), 830 (Surefire) y 264 (`inferencia`) (`.github/workflows/ci.yml`).

**Verificación** (31/10, Windows, sobre el código de esta versión):
- **Backend:** `mvn clean verify` con JDK 21 y la base en 5433, sin S3Mock local.
  - **Tests:** Failsafe `completed` 612, sin errores ni fallos, con 22 omitidos: los 14 de la CI más los 8 del IT de S3, que la CI corre contra S3Mock. Surefire 830.
  - **Cobertura y capas:** JaCoCo 94,9 % de líneas y 86,6 % de ramas sin el IT de S3; ArchUnit 0.
  - **Guarda:** con los mínimos nuevos, Surefire pasa y Failsafe da 590 ejecutados, justo los 598 de la CI menos los 8 de S3. La guarda completa la corre la CI de la release, con S3Mock.
- **Frontend:**
  - lint sin errores ni avisos (las capas en error) y typecheck OK;
  - `npm test` con 1420 tests en 152 archivos, todos ejecutados;
  - build con el Service Worker OK.
- **`inferencia/`:** sin cambios de código desde #133, donde dio 264 tests sin pesos y `lint-imports` sin contratos rotos. Esta versión solo cambia el número de `pyproject.toml`; la CI de la release lo vuelve a correr.
- **Antes, en cada PR:**
  - la CI y la revisión de arquitectura, con sus observaciones atendidas;
  - el adaptador HTTP contra el contenedor real de `inferencia` (#118, #126, #134);
  - Turnstile contra el `siteverify` real de Cloudflare con las claves de prueba (#132);
  - la prueba de carga de BE-12 con la imagen `prod` (#140);
  - pasadas en Chrome en modo headed (#120, #131, #135, #138).
- **Sin verificar en producción todavía:** la latencia de la moderación en Railway (NC-10b midió ~2,1 s en local con carga mixta, contra 2,5 s de lectura) y la prueba de humo con los puntos 17 a 23. Se hacen al publicar (runbook §10.1).

## v0.7.2 — Respaldo diario de la base (2026-10-25)

Hotfix desde `main` sobre v0.7.1, la versión que quedó en producción con el primer despliegue (DEP-09, 25/10). Agrega el servicio de respaldos de la base y no toca el código del API ni de la PWA. Las correcciones que salgan de DEP-09 van por esta vía (decisión del 25/10, registrada en v0.7.1).

### Primer despliegue (DEP-09, 25/10)
- **PWA:** `https://ciudadviva.app`, en Vercel. `www` redirige a la raíz.
- **API:** `https://api.ciudadviva.app`, en Railway, detrás del proxy de Cloudflare.
- **Despliegue automático:** los dos despliegan solos al fusionar en `main`, y Railway espera además a que pase la CI. `develop` no publica nada.
- **Verificado:**
  - el API arranca con las 18 migraciones, los 43 distritos, las 43 municipalidades y el ADMIN del usuario;
  - health UP; Swagger y `/v3/api-docs` dan 404 y `/actuator/env` da 401;
  - el CORS solo acepta la PWA;
  - la PWA es instalable, con su `sw.js`, el manifest y los iconos;
  - la CSP solo permite el API y las teselas de OpenStreetMap.

### Operación
- **Respaldo diario de la base** (`backend/scripts/respaldo-bd/`, servicio cron `respaldo-bd`):
  - **Qué hace:** con `postgres:16.15-alpine3.24`, un `pg_dump` en formato custom.
  - **Validación antes de subir:** `pg_restore` lee el volcado entero, y el índice tiene que incluir los datos de `flyway_schema_history`, así que una base vacía o equivocada no pasa.
  - **Subida:** a `ciudadviva-respaldos` en R2 con `curl --aws-sigv4`. El sha256 va firmado y las claves de R2 nunca quedan en los argumentos del proceso.
  - **Timeouts** en la conexión, los locks y la subida, para que un cuelgue no detenga el cron sin avisar.
  - **Por qué propio:** reemplaza a la plantilla «Postgres S3 Backups», que quedó archivada. La plantilla oficial actual despliega código de un tercero con acceso a la base, y el usuario eligió un script propio y revisado (25/10).
- **Runbook:**
  - **§5.3:** el servicio nuevo (carpeta raíz, *Watch Paths*, variables por referencia, cron a las 08:00 UTC y *Restart Policy* `On Failure` con 2 reintentos), la prueba contra R2 antes del primer cron y cómo enterarse de un fallo.
  - **§8:** la revisión semanal y la restauración del formato custom.
  - **§5.2:** el API ya no se redespliega por un cambio en el script.
  - **§5:** el estado después del primer despliegue.
  - **§9:** la contraseña de la base, solo alfanumérica.
- **C4 de despliegue:** `respaldo-bd` ya no figura como plantilla.

### Verificación
- **Respaldo en local,** con Docker contra el PostGIS de desarrollo y S3Mock 5.2.3:
  - sin variables, sale con código 1 y nombra la que falta;
  - con una base vacía, sale con código 1 y explica que falta `flyway_schema_history`;
  - con un host que no responde, corta a los 15 s sin mostrar la contraseña;
  - con un bucket inexistente, muestra el XML de error y sale con código 22;
  - con todo correcto, sube el volcado, y el sha256 del objeto descargado coincide con el que imprime el script.
- **Restauración según §8,** en una base nueva: sin errores y con la copia idéntica:
  - 190 reportes, 40 usuarios, 43 distritos y 309 filas de historial;
  - la misma versión de Flyway y PostGIS 3.4.3;
  - las 109 filas de `mv_indice_desempeno_distrital`.
- **Contra R2 real:** falta, porque S3Mock no valida la firma SigV4. Se verifica en la primera corrida del servicio en Railway, con `BACKUP_FILE_PREFIX=prueba`.
- **Código:** el del API y la PWA no cambia. Las cifras siguen siendo las de v0.7.1 (Failsafe 418, Surefire 230, frontend 1041 tests).

## v0.7.1 — Ajustes del iPhone y documentación del S7 (2026-10-25)

Versión de mantenimiento antes del primer despliegue (DEP-09). Reúne tres cosas:
- los ajustes que salieron de probar la PWA en el iPhone del usuario el 23/10;
- el cierre de la migración de capas del frontend;
- la documentación de las decisiones del 25/10.

**El backend y el contrato del API no cambian:** el código del backend y las migraciones (V1–V18) son los de v0.7.0. El ML queda para v0.8.0, el S7: NC-03a (#109) y NC-04 (#108).

**Número de versión:** es una excepción a `WORKFLOW.md` §8, que reserva el patch para un `hotfix/*` desde `main`. La pidió el usuario el 25/10. Sale de `develop` porque no cambia el backend ni el contrato, y #105–#107 no caben en un hotfix. Las correcciones que pida el primer despliegue (DEP-09) saldrán como v0.7.2 o siguientes.

### Diseño
- **DIS-1 · «Cuenta» es una pantalla** (#105). Antes, en el móvil, abría una hoja que ocupaba media pantalla.
  - **Destino:** el ítem «Cuenta» de la barra inferior lleva a `/perfil` («Mi perfil»), con las mismas reglas que las demás pantallas.
  - **Al final del perfil:** «Otras opciones», con Soporte y «Cerrar sesión».
  - **Funcionario y ADMIN:** como no tienen perfil editable, ven su cuenta: quiénes son, la apariencia, sus enlaces y el cierre de sesión.
  - **Sin conexión:** la pantalla igual deja cerrar sesión.
  - **Escritorio:** sigue el desplegable de la cabecera.
  - **Ruta:** pasó al grupo `(cuenta)`; la URL no cambia.
- **DIS-1 · Barra de cristal en el móvil** (#105). El usuario eligió el efecto A entre cuatro prototipos, a partir de su pedido del «scroll de WhatsApp».
  - **Barra:** la cabecera es translúcida (tinta al 70 % con `backdrop-filter`), y el contenido se ve pasar bajo la hora y la batería del iPhone (`viewport-fit=cover`, `black-translucent`).
  - **Título:** al desplazar, el de la pantalla entra centrado en la barra, ligado al dedo.
  - **Contraste:** 5,03:1 en claro y 5,24:1 en oscuro, con contenido blanco detrás. La barra es opaca en alto contraste y con transparencia reducida.
  - **Zonas seguras:** el marco reserva `env(safe-area-inset-*)` arriba, abajo y a los lados.
- **Volver a una pantalla** (#105), por ejemplo de Soporte al perfil, la deja donde estaba. Antes quedaba en blanco hasta mover el dedo.
- **Sin verificar en el iPhone real:** el paso del contenido bajo la hora con la PWA instalada. iOS 26.1 tuvo una regresión que dejaba opaca esa barra ([WebKit 301994](https://bugs.webkit.org/show_bug.cgi?id=301994)). Para ver la barra nueva hay que borrar la PWA de la pantalla de inicio y volver a agregarla.

### Arquitectura
- **FE-09 · Cierre de la migración de capas del frontend** (#106): la regla de capas de ESLint pasa a error, así que un import que rompa las capas hace fallar el lint y la CI. Lo dicen ARCHITECTURE.md §5.4 y §10, `WORKFLOW.md`, `docs/ci.md`, `frontend/CLAUDE.md`, `frontend/README.md` (la estructura con las capas), el nombre del paso informativo de la CI y la regla del agente `frontend-dev`. En `plan-migracion-capas.md` quedó marcada con la evidencia.

### Documentación y decisiones (#107)
- **Orden de los sprints:** el S7 (ML) va antes que el S6, que espera D-10, las fórmulas de los KPIs y las columnas del OB2. El S7 sale como v0.8.0 y el S6 como v0.9.0.
- **ARCHITECTURE.md §4.3, §6 y §8:** recogen la decisión de ML del 21/10:
  - el modelo RF-DETR Nano, con las clases `bache` y `grieta` y el umbral de 0,50;
  - la sugerencia como señal interna;
  - la desactivación de «Hueco en calzada», que hará la migración de NC-04 (v0.8.0); en esta versión la categoría sigue activa.

  Además, §4.3 fija el diseño de NC-04 del 25/10: el listener solo encola, `SugerenciaCategoriaService` es `@Async` y sin transacción, y aparece el puerto `CategoriasClasificables`. §6 suma `app/main.py` y el contrato de import-linter.
- **Plan:**
  - NC-03 se parte en NC-03a (el servicio) y NC-03b, y se actualiza la fila de NC-04 en `plan-migracion-capas.md`;
  - entran al S7 BE-11 y la atribución de RDD2022 (CC BY-SA 4.0) y de los pesos RF-DETR (Apache-2.0).
- **Decisiones del 25/10:**
  - el dominio `ciudadviva.app` (decisión 3);
  - la PWA en la raíz y el API en `api.ciudadviva.app` (3b);
  - Railway Hobby (decisión 4).
- **Runbook (`docs/despliegue.md`):**
  - **R2:** verificado contra la cuenta real.
  - **Dominio y correo:** Email Routing, DMARC, DNSSEC y Resend verificado.
  - **Producción:** los nombres de cada servicio, el dominio propio en Railway (SSL Full) y en Vercel, y `PORT=8080` obligatoria.
  - **Prueba de humo:** suma la caché de Cloudflare.
- **Estado de las cuentas al 25/10:**
  - el proyecto de Railway está creado, con `postgis` desplegado y `backend` todavía sin el repo conectado;
  - la API key de Resend existe;
  - R2 de producción y el proyecto de Vercel están pendientes.

  Fusionar esta versión en `main` todavía no despliega nada: el primer despliegue sigue siendo DEP-09, a mano.
- **C4 de despliegue** (`docs/arquitectura/c4-despliegue.md`): suma los dominios de la decisión 3b y el proxy de Cloudflare delante del API.

### Cifras
| Métrica | v0.7.0 | v0.7.1 |
|---|---|---|
| Tests de integración backend (Failsafe `completed`) | 418 | 418 (backend sin cambios) |
| Tests unitarios backend (Surefire) | 230 | 230 |
| Violaciones congeladas de ArchUnit | 0 | 0 |
| Tests frontend (archivos) | 1015 (118) | 1041 (121) |
| Avisos de capas frontend | 0 | 0 (desde FE-09 son errores) |

Los mínimos de la guarda de la CI no cambian.

**Verificación** (25/10, Windows, sobre el código de esta versión):
- **Backend:** `git diff v0.7.0 -- backend/` solo muestra el número de versión del `pom.xml`. Se mantiene la verificación de v0.7.0, y en cada PR corrió la CI.
- **Frontend:**
  - lint (con las capas en error) y typecheck sin avisos;
  - `npm test` con 1041 tests en 121 archivos, todos ejecutados;
  - build con `NEXT_PUBLIC_API_BASE_URL=https://api.ciudadviva.app` OK, con el Service Worker incluido.
- **Antes, en el PR #105:**
  - Chrome en modo headed con el viewport de iPhone 15, donde también se comprobó la memoria de desplazamiento al volver;
  - el usuario probó en su iPhone, por túnel, las versiones intermedias, pero la final no.

## v0.7.0 — Despliegue del MVP (2026-10-22)

Prepara el MVP para publicarlo según la propuesta aceptada el 21/10 (`project-context/decisions/propuestas/2026-10-21-despliegue-mvp.md`):
- **Infraestructura:** Railway (backend y PostGIS) y Vercel (PWA).
- **Servicios:** fotos en Cloudflare R2 y correo por Resend.

El despliegue en sí no entra en esta versión: v0.7.0 es el MVP **listo para desplegar**. El primer despliegue con el runbook (DEP-09) y su prueba de humo (DEP-10) quedan pendientes de las cuentas y las claves del usuario (`docs/despliegue.md`); lo que exijan corregir saldrá como hotfix `v0.7.x`. Es un sprint intercalado en el plan («Despliegue»), así que el S6 pasa a v0.8.0 y el S7 a v0.9.0.

### Preparación para desplegar
- **DEP-07 · Integración continua** (#84):
  - **Backend:** un job con PostGIS 16-3.4 y, desde #96, Adobe S3Mock.
  - **Frontend:** un job con lint, typecheck, tests y build.
  - **Guarda de completitud:** un `BUILD SUCCESS` sin tests no pasa.
  - **Protección:** el check `ci` es obligatorio en `develop` y `main` desde el 21/10 (#88).
- **DEP-01, DEP-02, DEP-03 y DEP-11 · Configuración de producción e imagen** (#89):
  - **Secreto JWT (SEC-03):** no tiene valor por defecto. La aplicación no arranca si falta, si es corto o si es el de desarrollo publicado.
  - **Perfil `prod`:** variables obligatorias. Swagger solo se publica con `SPRINGDOC_HABILITADO=true`. El actuator expone solo `health` en todos los perfiles.
  - **Imagen:** `backend/Dockerfile` multietapa sobre `eclipse-temurin:21-jre-noble`, sin root.
  - **Errores (DEP-11):** una foto de más de 10 MB, un método no admitido o una petición mal formada responden 413, 405 y 400, en lugar de 500.
  - **En la PWA (DEP-11, #99):** la foto de perfil se valida antes de subirla, con la misma regla que el backend.
- **DEP-04 y DEP-05 · Primer ADMIN y funcionarios** (#93):
  - **Primer ADMIN:** `AdministradorInicialSeeder` lo crea desde `ADMIN_INICIAL_*` solo si la base no tiene ninguno, como decidió el usuario el 22/10. Nunca promueve una cuenta existente.
  - **Funcionarios:** `backend/scripts/asignar-funcionario.sql` les asigna o revoca el distrito.
- **DEP-12 · Fotos en Cloudflare R2** (#96):
  - **Almacén:** un adaptador S3 con dos buckets privados. `FOTOS_ALMACEN` es obligatoria en `prod`.
  - **Contrato:** las URLs de las fotos no cambian, ni tampoco el contrato ni la CSP.
  - **Saneado:** cada foto se sanea al subirla (aplica la orientación EXIF, quita los metadatos y la reduce a 2048 px en JPEG).
  - **Concurrencia:** se sanean a lo sumo 2 fotos a la vez. Cuando no hay turno, responde 503.
- **DEP-08 · Correo por HTTP con Resend** (#98):
  - **Puerto `CorreoSaliente`:** el proveedor se elige con `CORREO_TIPO`, con un adaptador SMTP para desarrollo y tests y otro para Resend.
  - **Envío asíncrono:** la recuperación de contraseña y la respuesta de soporte se envían después del commit (patrón D-13).
  - **Recuperación de contraseña:** responde 202 siempre, sin revelar si la cuenta existe, con un tope de 3 tokens por cuenta y hora.
  - **Requisito:** sin dominio verificado, Resend solo entrega a la cuenta dueña.
- **DEP-06 · PWA instalable** (#85):
  - **Instalación:** iconos `any` y `maskable`, y un manifest con `id` y `scope`.
  - **Configuración:** `.env.example` queda versionada y la versión de Node es la 24.
  - **Build en Vercel:** falla si falta `NEXT_PUBLIC_API_BASE_URL`.
- **Runbook y C4 de despliegue:** `docs/despliegue.md` y `docs/arquitectura/c4-despliegue.md` (#87, #91).

### Diseño
- **DIS-1 · Sistema de diseño «Cívica», fase 1** (#95). La propuesta, el prototipo y la decisión del usuario del 21/10 están en `docs/diseno/` (#90).
  - **Tokens y temas:** tokens semánticos en tres temas.
  - **Tipografía y marca:** Public Sans, iconos de `lucide-react`, y un logo e iconos PWA nuevos.
  - **Componentes:** componentes base y un marco común con navegación por rol. El ciudadano tiene una barra inferior en móvil.
  - **Colores:** unas 1 250 clases de color pasan a tokens, y un test impide que vuelvan.
  - **Contraste:** 99 pares sin fallos AA.
- **US-23 · Apariencia** (#95):
  - **Temas:** claro, oscuro, alto contraste o el del sistema.
  - **Aplicación:** el tema se aplica antes de pintar (`public/tema.js`).
  - **Dónde se elige:** en el perfil o en el menú de cuenta.

La fase 2 (mapa con hoja inferior, reporte en pasos, bandeja con panel y portada) queda para una próxima versión.

### Correcciones del informe QA-1
El agente `qa-e2e` recorrió v0.6.0 en modo headed con los 4 roles, en escritorio y en móvil (`docs/qa/2026-10-21-mvp-v0.6.0.md`, #88). Encontró 0 bloqueantes, 5 importantes, 13 menores y 8 mejoras.
- **PWA** (#92):
  - **Ubicación del daño (I-1):** aparece en los tres detalles, con un mini mapa.
  - **Registro (I-2):** lleva al mismo destino que el inicio de sesión. Se elimina `/sesion`, que era de depuración.
  - **Mapa en móvil (I-4):** ocupa la primera pantalla.
  - **Menores y mejoras:** títulos por ruta, filtros en la URL, marcadores accesibles y una página 404 en castellano.
- **Backend** (#100):
  - **V18:** corrige las tildes de las categorías estándar sin tocar V3 (propuesta aceptada el 22/10, #94).
  - **Textos:** los mensajes del API, los correos y los push llevan tildes y etiquetas legibles. Los errores de validación están en español.
  - **Responsable sin asignar:** `GET /api/reportes/{id}/responsable` responde 204. Es un cambio de contrato, atendido en la PWA en #101.
  - **Exportación:**
    - suma columnas;
    - las fechas van en hora de Lima;
    - el CSV lleva BOM UTF-8.
  - **SEC-04:** el CSV neutraliza el texto libre que empieza como fórmula (CWE-1236). Se detectó en la revisión, antes de llegar a `develop`.
  - **Textos largos:** una descripción, un nombre o un apellido demasiado largos daban 500; ahora dan 400.
- **«Reportes que apoyas» (M-6):** `GET /api/reportes/mis-adhesiones` (#100) y una sección nueva en «Mis reportes» (#101) con los reportes de otros vecinos que el ciudadano apoya.
- **Los otros dos importantes:**
  - I-3, los iconos de la PWA, se resolvió en #85.
  - I-5, `/privacidad` con `[COMPLETAR]`, espera el texto legal del usuario.

### Arquitectura y decisiones
- **Agentes del equipo** (#83): `backend-dev`, `frontend-dev`, `qa-e2e`, `arquitecto` y `disenador-ui` en `.claude/agents/`. Los lanza la sesión coordinadora, y `WORKFLOW.md` incorpora esa modalidad (#83) y la CI como guarda (#88).
- **Propuestas** (#87), aceptadas el 21/10:
  - **Despliegue:** la configuración descrita al inicio de esta versión.
  - **Correo:** por HTTP, con Resend.
  - **Fotos:** en R2.
  - **Modelo de ML:** clases `bache` y `grieta` de RDD2022 con pesos RF-DETR (Apache-2.0) y umbral de 0,50. «Hueco en calzada» se desactivará con NC-04.
- **Abiertas:**
  - las diferencias con ARCHITECTURE §4.3;
  - el refresco asíncrono del índice de desempeño (#97): con 16 creaciones simultáneas de reportes con foto, el pool de conexiones se agota durante unos 30 s. No bloquea esta versión: DEP-12 cumple su criterio con 8 subidas simultáneas.

  Las decisiones pendientes del usuario están indexadas en `propuestas/2026-10-21-decisiones-pendientes.md`.
- **ARCHITECTURE.md §4.3:** `common` reúne los puertos de fotos y correo (#98).
- **Diagramas de arquitectura** (#102): R2 y Resend en los C4, el despliegue con las decisiones aceptadas y V18 en el modelo de datos.
- **Privacidad:** salió del repositorio una transcripción de reunión que no debía versionarse (#88). El historial no se reescribió.

### Cifras
| Métrica | v0.6.0 | v0.7.0 |
|---|---|---|
| Tests de integración backend (Failsafe `completed`) | 309 | 418 |
| Tests unitarios backend (Surefire) | 62 | 230 |
| Violaciones congeladas de ArchUnit | 0 | 0 |
| Tests frontend (archivos) | 646 (83) | 1015 (118) |
| Avisos de capas frontend | 0 | 0 |
| Imagen del backend (sin comprimir / comprimida) | — | 399,75 MB (medida en #98) / 186 MB |

Los mínimos de la guarda de la CI suben a 418 y 230 (`.github/workflows/ci.yml`).

**Verificación** (22/10, Windows, sobre el código de esta versión):
- **Backend:** `mvn clean verify` con S3Mock local, como en la CI.
  - **Tests:** Failsafe `completed` 418, sin errores, fallos ni omitidos; el IT de S3 incluido.
  - **Unitarios:** Surefire 230.
  - **Cobertura y capas:** JaCoCo 93,4 % de líneas y 80,5 % de ramas; ArchUnit 0.
  - **Guarda:** la de la CI pasa con los mínimos nuevos.
- **Frontend:**
  - lint con 0 avisos (0 de capas) y typecheck OK;
  - `npm test` con 1015 tests en 118 archivos, todos ejecutados;
  - build OK.
- **Imagen del backend** con el perfil `prod`, contra un PostGIS 16-3.4 vacío y S3Mock en lugar de R2:
  - **Arranque y datos:** aplica V1–V18 y siembra 43 distritos y 43 municipalidades. Las categorías estándar quedan con tildes y se crea un solo ADMIN desde `ADMIN_INICIAL_*`. `/actuator/health` responde UP en 9 s.
  - **Superficie expuesta:** Swagger y `/v3/api-docs` dan 404 y `/actuator/env` da 401. El login del ADMIN da 200 y el log no tiene errores ni muestra la contraseña.
- **Antes, en cada PR:**
  - la imagen real contra una base vacía (#89, #98) y el jar (#93);
  - 8 subidas simultáneas de fotos de 24 a 40 MP sin quedarse sin memoria (#96);
  - Resend real, que responde 401 con una clave inventada (#98);
  - pasadas en Chrome en modo headed, en escritorio y móvil (#92, #95, #101).

## v0.6.0 — Sprint 5 (2026-10-21)

### Historias de usuario
- **NC-01 · Municipalidades y periodo de gestión** (#70, parcial a propósito):
  - Módulo `municipalidades` con MUNICIPALIDAD, 1:1 con el distrito (D-09), y PERIODO_GESTION, con fechas inclusivas y sin solape (V15, V16).
  - Las 43 municipalidades las siembra un `ApplicationRunner` después de los distritos. Una migración no serviría: en una base vacía los distritos todavía no existen cuando corre Flyway.
  - GESTION_MUNICIPAL y REQUISITO_RECEPCION se crean con NC-06 y NC-05 (propuesta aceptada, opción A).
- **NC-02 · Título, severidad y periodo del reporte** (#74 backend, #79 PWA):
  - **Campos nuevos:** `titulo` (5–120 caracteres tras el trim) y `severidad` (Baja/Media/Alta, sin valor por defecto) son obligatorios al crear y editables en PENDIENTE. Los fija el ciudadano y son públicos. El funcionario los ve, pero no los cambia.
  - **Periodo de gestión:** `periodo_gestion_id` se asigna al crear y no se expone.
  - **V17 rellena los reportes existentes:** título «<categoría> en <distrito>», severidad MEDIA y el periodo de su fecha.
  - **Idempotencia:** una `Idempotency-Key` ya registrada devuelve la respuesta original antes de validar los campos nuevos, para que la cola offline pueda reenviar reportes viejos.
  - **Cola offline:** nuevo estado «incompleto» para los reportes encolados por la versión anterior. No se reenvía solo ni se purga. El ciudadano lo completa en «Pendiente de envío» con un título sugerido, y se envía con la **misma** clave. Mientras haya incompletos se muestra un aviso, que se puede cerrar.
  - **Adhesión (US-09):** muestra el título y la severidad del reporte existente.
- **US-19 · Comparar distritos** (#73, criterios provisionales en #68): en `/desempeno` se comparan de 2 a 4 distritos lado a lado, con la tasa de resolución, resueltos/total y el tiempo promedio, más una gráfica de barras accesible. La comparación queda en la URL y respeta el filtro por tipo de daño. Sin cambios de API.
- **US-01 · Responsabilidad sobre las fotos** (#64, #67): nueva §10 en el borrador de términos. La versión sigue en `2026-10-v1`.

### Correcciones
- **Mapa sin calles en producción** (#78): en cuanto el Service Worker controlaba la página, cada tesela fallaba con `net::ERR_FAILED`, en el iPhone, en Android y en escritorio. El SW las repite con `fetch()`, que se rige por `connect-src`, y el host de OSM solo estaba en `img-src`.
  - **Arreglo:** el host va también en `connect-src` (solo `tile.openstreetmap.org`, sin comodín) y las teselas se piden con `crossOrigin`, así que en la caché no quedan respuestas opacas que gastan cuota.
- **Build de producción** (#72): `esbuild` faltaba en el lockfile (peer opcional de `@serwist/cli`), así que el build fallaba en cualquier instalación limpia.
- **FE-07** (#69) además corrigió la CSP `img-src`, que bloqueaba las fotos de los reportes.

### Arquitectura y decisiones
- **FE-07** (#69): las URLs de fotos se resuelven en el gateway, y la foto de perfil pasa a `auth/api.ts` y a un hook.
- **FE-08** (#71): cierre de dependencias entre features, sin cambios de código.
- **Marca visible Ciudad Viva** (#62, #63, #65, #66): los identificadores técnicos `viasegura` se conservan a propósito.
- **Diagramas de arquitectura** (#80): módulo `municipalidades`, las columnas de NC-02 en el modelo de datos y las teselas por el Service Worker en el C4 de contenedores.
- **Documentación:** traspaso de sesión, el entorno en Windows y en macOS, y el script de datos de prueba (#75, #76). También se repuso el encabezado de v0.4.0 en este archivo (#77).

### Cifras
| Métrica | v0.5.0 | v0.6.0 |
|---|---|---|
| Tests de integración backend (Failsafe `completed`) | 284 | 309 |
| Tests unitarios backend (Surefire) | 57 | 62 |
| Violaciones congeladas de ArchUnit | 0 | 0 |
| Tests frontend (archivos) | 547 (76) | 646 (83) |
| Avisos de capas frontend | 0 | 0 |

**Verificación en vivo** (21/10, Windows):
- **Entorno:** build de producción de la PWA y backend de `develop`, detrás de túneles HTTPS de `cloudflared`, con los datos de prueba (166 reportes en 11 distritos).
- **Migración:** V15–V17 se aplicaron sobre la base de desarrollo con datos.
- **NC-02, en Chrome contra el backend real:**
  - crear da 201 y el reporte cae en Miraflores;
  - un título de 4 caracteres se bloquea con `aria-invalid`;
  - la edición en PENDIENTE se guarda;
  - la adhesión muestra los datos del reporte existente;
  - un ítem incompleto en IndexedDB no se envía solo;
  - al completarlo se envía con la misma clave (reporte #185).
- **Mapa con el SW activo:** 6 de 6 teselas en tres recargas, guardadas en caché como respuestas `cors`.
- **API por el túnel:**
  - CORS, login, densidad y clave VAPID responden;
  - un `POST` sin título da 400.

## v0.5.0 — Sprint 4 (2026-10-20)

### Historias de usuario
- **US-11 · Mapa de calor** (#51 backend, ya en v0.4.0; #57 PWA):
  - **Capas del mapa:** en `/mapa`, casillas separadas para marcadores y capa de calor, con los mismos filtros del panel.
  - **Dibujo:** cada celda de ~110 m es un `CircleMarker` en un canvas compartido, sin plugin ni dependencias nuevas, debajo de los marcadores.
  - **Escala:** 4 niveles relativos al máximo de la vista con piso de 4, para que un reporte aislado no se vea como «muy alta». Leyenda accesible.
  - **Consultas:** solo con la capa encendida y al cambiar filtros (debounce de 400 ms); respeta ETag y `max-age=60`.
- **US-01 · Términos sin pestaña nueva** (#59): en el registro y en el perfil, el texto de términos y privacidad se lee en un diálogo modal (`<dialog>` nativo, `components/ui/dialogo.tsx`) sin perder lo escrito. El enlace sigue apuntando a `/privacidad` para Ctrl/Cmd o sin JavaScript.

### Arquitectura y decisiones
- **BE-06 cerrada** (#58): se acepta la opción A de `propuestas/2026-10-20-asignacion-geo-en-distritos.md`. `GeoAssignmentStrategy` y `PointInPolygonAssignmentStrategy` pasan a `distritos/port` y `distritos/infra` (mismos nombres); `reportes` usa el puerto de `distritos`. `soloApiPublicaDeOtrosModulos` y el almacén de ArchUnit quedan en 0, sin recongelar.
- **FE-06** (#55): las mutaciones de los componentes pasan a hooks de su feature; la `Idempotency-Key` de `FormularioReporte` vive en el hook.
- **Diagramas de arquitectura** (#56): skill `/diagramas` y `docs/arquitectura/` (C4 de contexto y contenedores, capas, módulos y modelo de datos), regenerados tras BE-06.

### Cifras
| Métrica | v0.4.0 | v0.5.0 |
|---|---|---|
| Tests de integración backend (Failsafe `completed`) | 284 | 284 |
| Tests unitarios backend (Surefire) | 57 | 57 |
| Violaciones congeladas de ArchUnit | 3 | 0 |
| Tests frontend (archivos) | 473 (67) | 547 (76) |
| Avisos de capas frontend | 18 | 0 |

**Verificación en vivo** (20/10, macOS con JDK 21, backend y PWA levantados):
- **US-01:** Playwright en modo headed, 15/15: el diálogo abre y cierra con el botón y con Esc, conserva los valores, no abre otra pestaña y el registro responde 201.
- **US-11 y desempeño:** con datos de prueba locales (166 reportes en 11 distritos), `/api/reportes/densidad` y `/api/desempeno/distritos` responden con datos y la PWA los consume sin errores de CORS.

## v0.4.0 — Sprint 3 (2026-10-20)

### Historias de usuario
- **NC-07b · Consentimiento por finalidad y versión** (D-12; #42 backend, #46 PWA):
  - **Registro:** exige aceptar los términos `2026-10-v1`. Hay una página `/privacidad` con el borrador, que muestra el aviso «Borrador pendiente de revisión» y los `[COMPLETAR]` visibles.
  - **Cuentas anteriores:** pasan por `/aceptar-terminos`. Mientras tanto, el API responde 403 `TERMINOS_PENDIENTES`, salvo en `/me`, los consentimientos y la baja de push.
  - **Perfil:** nueva sección «Privacidad y consentimientos» para otorgar y retirar el consentimiento de correo y de push, con su historial.
  - **Correos:** los avisos de estado por correo requieren el consentimiento de correo. Los correos que pide el propio usuario (contraseña, soporte) se envían siempre.
- **US-21 · Notificaciones push reales** (#43 backend, #52 PWA):
  - **Envío:** Web Push con VAPID por variables de entorno (nunca en el repo) y clave pública en `GET /api/notificaciones/vapid-public-key`. Se envía de forma asíncrona y fuera de la transacción (D-13). Una suscripción caducada (404/410) se desactiva.
  - **En la PWA:** se activa por navegador desde el perfil y se vuelve a registrar al iniciar sesión, incluida la rotación de claves. La baja ocurre al cerrar sesión, antes de borrar el token; si falla, salvo por un 404, se cancela la suscripción local.
  - **Al hacer clic:** el aviso solo abre rutas del mismo origen.
- **US-06 · Cola offline de reportes** (#44): sin red o con el token vencido, el reporte se guarda en IndexedDB y se reenvía solo al recuperar la sesión, con la misma `Idempotency-Key` (límite de 48 h). Al cerrar sesión se puede conservar o descartar la cola. El 403 `TERMINOS_PENDIENTES` deja el reporte pendiente; no lo da por rechazado.

### Seguridad
- **Redirects abiertos:** el destino tras el login o la aceptación de términos y la ruta de un aviso push se validan después de parsear la URL. Se cierran los bypass con caracteres de control (`/\t/otro`) y con rutas que se normalizan a `//otro` (`/.//otro`).
- **Push de quien salió:** un dispositivo compartido no sigue mostrando los avisos de quien cerró sesión, ni con el JWT vencido.
- **SSRF:** la lista de hosts permitidos de push y el tope de 10 suscripciones por usuario se mantienen del S2.

### Arquitectura y decisiones
- **FE-05** (#41): hooks de carga y páginas como composición. Se anticipa `src/lib/api/catalogos.ts`.
- **D-13** (#45): las notificaciones corren asíncronas y con la E/S de red fuera de la transacción (ARCHITECTURE.md §4.5).
- **D-14** (#45): `src/lib/sesion/` coordina el cierre de sesión (`antesDeCerrarSesion`).
- **Borrador legal** `project-context/legal/terminos-y-privacidad-v1.md` (#40), con `[COMPLETAR]` pendientes de los autores.
- **Adelantos del S4:**
  - **BE-10** (#48): el archivo subido llega a `service/` como `ArchivoSubido`, sin tipos de Spring Web.
  - **BE-06** (#49, parcial): cada módulo usa la API pública de los demás, y ArchUnit baja de 48 a 3. Las 3 restantes esperan la propuesta `2026-10-20-asignacion-geo-en-distritos.md`.
  - **US-11 backend** (#51): `GET /api/reportes/densidad`, público, con una grilla de ~110 m, sin señales internas, y ETag + `max-age=60`.

### Cifras
| Métrica | v0.3.0 | v0.4.0 |
|---|---|---|
| Tests de integración backend (Failsafe `completed`) | 238 | 284 |
| Tests unitarios backend (Surefire) | 37 | 57 |
| Violaciones congeladas de ArchUnit | 48 | 3 |
| Tests frontend (archivos) | 232 (34) | 473 (67) |
| Avisos de capas frontend | 44 | 18 |

**Verificación en vivo** (20/10, sobre develop 8f56640, con claves VAPID de desarrollo):
- **API:** 16 comprobaciones:
  - registro sin aceptar → 400, con otra versión → 409, aceptando → 201;
  - un usuario anterior recibe 403 `TERMINOS_PENDIENTES` hasta aceptar;
  - suscribirse sin consentimiento push → 409;
  - el cambio de estado intenta el push en segundo plano.
- **Navegador (Chrome con perfil persistente):**
  - el login de una cuenta anterior lleva a `/aceptar-terminos` con el borrador visible;
  - al aceptar vuelve a `/mis-reportes`, con los consentimientos guardados con su versión;
  - el perfil activa push en el navegador y la suscripción queda registrada en FCM;
  - el funcionario cambia el estado y el Service Worker muestra «Su reporte #14 fue recibido.», con la URL `/mis-reportes/14`;
  - al cerrar sesión, la suscripción se borra del servidor;
  - al volver a entrar, se registra de nuevo.
  
  La consola quedó sin errores, salvo por un icono del manifest que falta (`/icons/icon-512.png`, pendiente para la sesión de diseño del S8).

## v0.3.0 — Sprint 2 (2026-10-19)

### Historias de usuario
- **US-25 · Soporte** (#26, #36): `/soporte` para cualquier usuario con sesión (crear ticket y ver los propios) y área del ADMIN en `/admin/soporte` (lista paginada con filtro por estado, correo y autor; responder). La respuesta llega por correo. El ADMIN ya tiene su propia página de inicio.
- **US-29 · Categorías del distrito** (#27, #37): `/categorias` para el funcionario (crear, editar, desactivar y reactivar las propias; las estándar en solo lectura). Desactivar una categoría solo hace que deje de ofrecerse: los reportes existentes siguen editables (antes daba 409).
- **US-12 · Búsqueda por fechas** (#30, #31): fechas desde/hasta y una vista «Lista» en `/mapa`. Una fecha mal formada o un parámetro con tipo inválido dan 400 en cualquier endpoint (antes 500), y el rango invertido da 400 también en la exportación.
- **NC-07 · Suscripciones Web Push** (#33): alta y baja de suscripciones del navegador. Solo se aceptan servicios push conocidos (anti-SSRF), con un tope de 10 por usuario y alta atómica. El envío real llega con US-21 (S3).

### Seguridad
- **SEC-02** (#32, #35): `posibleReincidencia` (la señal del detector de US-27) salía en la búsqueda pública, el detalle y las vistas del ciudadano. Ahora solo la ve el funcionario de ese distrito, en su bandeja.

### Arquitectura y decisiones
- **FE-03** (#29) y **FE-04** (#28): tipos en `model/` e imports relativos dentro de cada feature.
- API pública de `auth` (`UsuarioConsultaService`, adelanto de BE-06).
- La guardia ya no confunde `git merge-base` con `git merge` (#24).
- **D-12 · Consentimiento** por finalidad y versión (#25, #34); se implementa en S3.
- `useCarga` recarga sin desmontar la lista.

### Cifras
| Métrica | v0.2.0 | v0.3.0 |
|---|---|---|
| Tests de integración backend (Failsafe `completed`) | 178 | 238 |
| Tests unitarios backend (Surefire) | 11 | 37 |
| Violaciones congeladas de ArchUnit | 51 | 48 |
| Tests frontend (archivos) | 136 (19) | 232 (34) |
| Avisos de capas frontend | 64 | 44 |

**Verificación en vivo** (19/10, sobre develop ce17b1b): 27 comprobaciones contra el API real.
- Ticket de un ciudadano → el ADMIN lo filtra y lo responde → la respuesta llega por Mailhog.
- Categoría creada, editada (reemplazo), desactivada (fuera del catálogo, reporte PENDIENTE editable) y reactivada.
- El flag solo aparece en la bandeja.
- 400 para fechas mal formadas y rango invertido.
- Suscripción push creada, rechazada para un host interno y borrada.
- En el navegador: el ADMIN aterriza en `/admin/soporte`, el funcionario gestiona `/categorias`, y un ciudadano recibe el aviso de acceso denegado del área de administración.

## v0.2.0 — Sprint 1 (2026-10-13)

### Historias de usuario
- **US-03 · Recuperar contraseña** (#16): pantalla de dos pasos en la PWA (correo → token + contraseña nueva). No revela si la cuenta existe y muestra el 404/409 del token con el mensaje del backend.
- **US-04 · Cerrar sesión** (#17, #21): botón común en todas las vistas del ciudadano y del funcionario. El Service Worker ya no guarda respuestas del API (`NetworkOnly` para `/api/`), y al cerrar sesión se borra su caché entre orígenes, para que el siguiente usuario del equipo no vea datos del anterior.
- **US-28 · Exportar a Excel/CSV** (#18, #15): botones en la bandeja con los filtros activos. El backend expone `Content-Disposition` por CORS, así que el archivo baja con su nombre (`reportes-<distrito>.csv|xlsx`).
- **US-17 · Dashboard del distrito** (#19): `/dashboard` del funcionario, con el índice público separado de las señales de gestión interna. `null` se muestra «Sin datos».

### Arquitectura (plan de migración de capas)
- **BE-02 / BE-07** (#10): puertos y adaptadores (`geo`, notificaciones). El puerto de fotos pasa a `common` (D-11), lo que corta el único ciclo entre módulos.
- **BE-03** (#12): el seeder de distritos pasa a `infra/`, y el exportador queda detrás de un puerto con adaptadores Excel y CSV.
- **BE-04** (#13): `CrearReporteCommand` pasa a `service/`.
- **BE-05** (#14): se confirma la regla de listeners.
- **FE-02** (#9): reglas puras a `model/` y estados a `lib/types`.
- Adelantos de FE-05: `useCarga` y `mensajeDeError`.
- GitFlow (#8), plan de sprints (#11) y cierre del Sprint 1 en los planes (#20).

### Cifras
| Métrica | v0.1.0 | v0.2.0 |
|---|---|---|
| Tests de integración backend (Failsafe `completed`) | 177 | 178 |
| Violaciones congeladas de ArchUnit | 53 | 51 |
| Tests frontend (archivos) | 80 (8) | 136 (19) |
| Avisos de capas frontend | 67 | 64 |

## v0.1.0 (2026-10-11)
Estado inicial etiquetado al adoptar GitFlow: backend y PWA con la mayoría de US-01..US-30 (ver la auditoría en `plan-sprints.md`), la norma de capas con su línea base y el workflow de agentes.

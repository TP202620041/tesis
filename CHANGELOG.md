# Cambios

Versiones de Ciudad Viva (antes ViaSegura) según GitFlow (`WORKFLOW.md` §8): cada sprint cierra con una versión minor en `main`. Plan: `project-context/decisions/plan-sprints.md`.

## v0.7.0 — Despliegue del MVP (2026-10-22)

Prepara el MVP para publicarlo según la propuesta aceptada el 21/10 (`project-context/decisions/propuestas/2026-10-21-despliegue-mvp.md`):
- **Infraestructura:** Railway (backend y PostGIS) y Vercel (PWA).
- **Servicios:** fotos en Cloudflare R2 y correo por Resend.

El despliegue en sí no entra en esta versión: necesita las cuentas y las claves del usuario (`docs/despliegue.md`). Es un sprint intercalado en el plan («Despliegue»), así que el S6 pasa a v0.8.0 y el S7 a v0.9.0.

### Preparación para desplegar
- **DEP-07 · Integración continua** (#84):
  - **Backend:** un job con PostGIS 16-3.4 y, desde #96, Adobe S3Mock.
  - **Frontend:** un job con lint, typecheck, tests y build.
  - **Guarda de completitud:** un `BUILD SUCCESS` sin tests no pasa.
  - **Protección:** el check `ci` es obligatorio en `develop` y `main` desde el 21/10 (#88).
- **DEP-01, DEP-02, DEP-03 y DEP-11 · Configuración de producción e imagen** (#89):
  - **Secreto JWT (SEC-03):** no tiene valor por defecto. La aplicación no arranca si falta, si es corto o si es el de desarrollo publicado.
  - **Perfil `prod`:** variables obligatorias y actuator solo con `health`. Swagger solo se publica con `SPRINGDOC_HABILITADO=true`.
  - **Imagen:** `backend/Dockerfile` multietapa sobre `eclipse-temurin:21-jre-noble`, sin root.
  - **Errores (DEP-11):** una foto de más de 10 MB, un método no admitido o una petición mal formada responden 413, 405 y 400, en lugar de 500.
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
  - **Foto de perfil:** se valida antes de subirla, con la misma regla que el backend (#99).
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
- **Agentes del equipo** (#83): `backend-dev`, `frontend-dev`, `qa-e2e`, `arquitecto` y `disenador-ui` en `.claude/agents/`. Los lanza la sesión coordinadora, y `WORKFLOW.md` incorpora esa modalidad y la CI como guarda (#88).
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
| Imagen del backend (sin comprimir / comprimida) | — | 399,75 MB / 186 MB |

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
  - la imagen real contra una base vacía (#89, #93, #98);
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

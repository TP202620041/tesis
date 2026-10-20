# ViaSegura — Frontend (PWA)

Frontend del **Sistema de crowdsourcing geoespacial para el reporte ciudadano
y la gestión municipal de infraestructura vial en Lima Metropolitana**
(Trabajo de Investigación — UPC).

Autores: León Vivas, Fabrizio Amir · Lopez Acuña, Mario Joaquin
Asesor: Reyes Silva, Patricia

## Stack

- **Next.js 16** (App Router, Turbopack) + **React 19** + **TypeScript estricto**.
- **Tailwind CSS 4** para estilos.
- **Serwist** para el Service Worker (PWA offline-first).
- **openapi-typescript** para generar los tipos del API desde el contrato real.

Consume el API REST de Spring Boot del directorio hermano `../backend`.

## Cómo levantarlo (local)

```bash
# 1. Backend (en ../backend): base de datos + API
POSTGRES_PORT=5433 docker compose up -d
POSTGRES_PORT=5433 mvn spring-boot:run     # queda en :8080

# 2. Frontend
cp .env.local.example .env.local
npm install
npm run dev                                 # queda en :3000
```

> El backend permite el origen `http://localhost:3000` vía CORS
> (`app.cors.allowed-origins`). Si cambias el puerto del frontend, ajusta esa
> propiedad o el navegador bloqueará las llamadas en el preflight.

### Scripts

| Script | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo (Turbopack). El Service Worker está desactivado aquí. |
| `npm run build` | Build de producción **y** compilación del Service Worker. |
| `npm run typecheck` | `tsc --noEmit`. |
| `npm test` | Suite de Vitest. |
| `npm run api:sync` | Descarga el OpenAPI del backend y regenera los tipos. |

## Testing

**Vitest + Testing Library, con alcance deliberado:** lógica pura y
componentes sin mapa. **No se testea Leaflet en jsdom** — jsdom no implementa
layout ni canvas, así que un test de mapa verificaría un mock de
`react-leaflet` en vez del comportamiento real: mucho andamiaje, poca
garantía. Lo que sí se testea es lo que decide *qué* se le pide al backend y
*cómo* se representa cada estado, que es donde viven los errores reales. El
mapa se verifica en el navegador.

Dos detalles de configuración que costaron encontrar:

- El pool `forks` (el que Vitest usa por defecto) no logra arrancar sus
  workers en Windows aquí — falla con *"Timeout waiting for worker to
  respond"* sin ejecutar un solo test. Se fija `pool: 'threads'`.
- Sin `globals: true`, Testing Library **no registra su limpieza
  automática**; los renders se acumulan en el mismo documento y las consultas
  empiezan a encontrar elementos duplicados de tests anteriores. Por eso
  `vitest.setup.ts` llama a `afterEach(cleanup)` explícitamente.

## Estructura

```
src/
├── app/                        # App Router: solo routing y composición
│   ├── (public)/               # sin login — mapa, desempeño, guía
│   ├── (auth)/                 # login, registro, recuperar-password
│   ├── (ciudadano)/            # rol CIUDADANO — mis-reportes, reportar, perfil
│   ├── (municipal)/            # rol FUNCIONARIO_MUNICIPAL — bandeja, dashboard
│   ├── (cuenta)/               # cualquier usuario con sesión — soporte
│   └── (admin)/admin/          # rol ADMIN — soporte (bandeja de tickets)
├── features/                   # lógica por dominio, no por tipo de archivo
│   ├── auth/  reportes/  desempeno/  gestion/  soporte/  legal/
├── lib/
│   ├── api/                    # cliente HTTP tipado + tipos generados + catálogos compartidos
│   ├── auth/                   # almacenamiento del token
│   ├── sesion/                 # pasos que otras features registran antes del cierre de sesión (D-14)
│   └── types/domain.ts         # uniones de enums y alias de dominio
├── components/ui/              # presentacionales compartidos
├── map/                        # cliente de mapas encapsulado (Leaflet)
└── pwa/                        # Service Worker aislado
```

Las vistas de `app/` componen; la lógica vive en `features/`. Un componente de
`app/` no debe llamar al API directamente: pasa por `features/<dominio>/api.ts`.

## Decisiones técnicas

### Cliente HTTP: `fetch` nativo con wrapper

No se usa axios ni ky. El App Router extiende `fetch` con su propia semántica
de caché y revalidación, que los Server Components aprovechan de forma nativa;
una librería externa la pierde del lado servidor y además envía peso al
cliente para resolver lo que aquí son unas pocas decenas de líneas
(`src/lib/api/client.ts`): URL base, JSON, `Authorization`, traducción de
errores y manejo centralizado del 401.

### Tipos: generados del OpenAPI + capa fina a mano

`src/lib/api/generated/schema.ts` se genera con `npm run api:sync` desde
`/v3/api-docs` del backend y **no se edita**. Transcribir los DTO a mano
llevaría a un desfase silencioso; generarlos hace que un cambio de contrato
aparezca al regenerar.

El spec de springdoc tiene dos limitaciones que se corrigen en
`src/lib/types/domain.ts`:

1. Los records de Java no llevan nulabilidad, así que casi todo campo de
   respuesta sale opcional (`id?`, `email?`). Se declaran requeridos los que
   son NOT NULL en el backend.
2. Los enums viajan como `string` plano (los DTO los exponen con `.name()`).
   Se recuperan como uniones literales, lo que da exhaustividad en los
   `switch`.

### Service Worker: Serwist en modo configurador

Se eligió **Serwist** y no `next-pwa`: este último quedó sin mantenimiento y
no soporta bien App Router. La [guía oficial de PWA de Next.js 16](https://nextjs.org/docs/app/guides/progressive-web-apps)
recomienda Serwist explícitamente para caching offline con Service Worker.
Sobre Workbox, trae un `BackgroundSyncPlugin`, que al final no se usa para
US-06 (ver "Cola offline").

Se usa el **modo configurador** (`serwist.config.mjs` + `@serwist/cli`) en vez
del plugin `withSerwistInit`: el plugin inyecta configuración de **webpack**, y
desde Next 16 el bundler por defecto es **Turbopack** — combinarlos rompe el
build. Las salidas eran forzar `next build --webpack`, renunciando al bundler
por defecto del framework, o compilar el SW como paso aparte. Se eligió lo
segundo: Turbopack sigue siendo el bundler de la app y el SW deja de depender
de su pipeline de bundling.

**El API nunca se cachea** (`NetworkOnly` para `/api/**`, antes de
`defaultCache`): su regla `cross-origin` guardaría respuestas que dependen del
usuario (`/api/auth/me`, `mis-reportes`, `mi-distrito`) y el siguiente usuario
del dispositivo podría recibirlas offline. Al cerrar sesión (US-04) además se
borra esa caché, por si la llenó una versión anterior del SW
(`src/pwa/cachesDeSesion.ts`).

### Seguridad: dónde vive el JWT

**Decisión: `localStorage`, con su costo asumido explícitamente.**

El backend emite un bearer token en el cuerpo de la respuesta
(`AuthResponse.token`) y lo espera en `Authorization`. Es un diseño stateless
deliberado (ver la decisión de US-04 en el README del backend). Pasar a cookie
`httpOnly` exigiría cambiar el backend y, como el frontend corre en otro
origen, la cookie tendría que ser `SameSite=None; Secure` con
`Access-Control-Allow-Credentials` — frágil de sostener en desarrollo. Además,
la cola offline de US-06 reenvía reportes por su cuenta: con bearer token
adjunta el header explícitamente (el vigente, leído al enviar) y controla el
reintento; con cookie dependería de que el navegador la adjunte en contexto
cross-origin, que es justo donde las políticas son más restrictivas.

**Lo que se pierde, sin adornos:** `localStorage` es legible por cualquier
script de la página. Ante un XSS (por ejemplo una dependencia comprometida) el
token puede exfiltrarse y usarse desde fuera del navegador de la víctima. Se
agrava con la decisión de US-04: el backend no tiene blacklist, así que un
token robado sigue siendo válido hasta expirar (120 min), incluso si el
usuario cambia su contraseña.

**Matiz para no sobrevender la alternativa:** una cookie `httpOnly` *no* evita
que un XSS abuse de la sesión — el navegador adjunta la cookie igual y el
atacante puede hacer requests autenticados desde la página. Lo que evita es la
*exfiltración* del token. Es una mejora real, pero parcial.

Por eso la mitigación principal ataca la causa y no la consecuencia: una
**Content-Security-Policy estricta** en `next.config.ts`, que reduce la
probabilidad de que exista XSS y protege igual a cualquier modelo de
almacenamiento. Complementos: el token se toca en un único módulo
(`src/lib/auth/token-storage.ts`), nunca se registra en logs, y esa
centralización es lo que haría barata una migración futura a `httpOnly`.

### Cola offline (US-06): en la página, no en el Service Worker

Un reporte que falla por `NetworkError` se guarda en **IndexedDB**
(`src/pwa/colaReportes.ts`) con **su `Idempotency-Key`**, y la aplicación lo
reenvía sola (`features/reportes/hooks/useColaOffline.ts`) al montarse, al
volver la conexión (`online`), al volver a la pestaña y cada 30 s mientras
quede algo pendiente. Lo dispara `app/SincronizadorDeReportes.tsx`, montado en
el layout raíz: con la cola vacía no hace nada (ni consulta la sesión); con
reportes en cola y token, pregunta `/me` **una vez por sesión** (no en cada
navegación) para saber de quién son. Los hooks llegan al almacén a través de
`features/reportes/api.ts`, que lo reexporta.

**Por qué no un `BackgroundSyncPlugin` en el Service Worker** (lo que se
planeaba): la cola de Serwist/Workbox guarda la *petición* completa y la
repite tal cual, con su `Authorization` original. Si el token venció mientras
el reporte esperaba (el backend lo expira a los 120 min), cada reintento daría
401 para siempre. El SW tampoco puede leer el token nuevo: vive en
`localStorage`, que no existe en un worker, y lo toca solo
`lib/auth/token-storage.ts`. Se evaluaron dos salidas:

| | (a) Cola en la página (elegida) | (b) Pasar el token al SW por `postMessage` |
|---|---|---|
| Token | Se lee al enviar, del único módulo que lo toca | Una segunda copia en el SW; para sobrevivir a que el SW se detenga habría que persistirla (IndexedDB): el JWT en reposo en otro lugar |
| Token vencido | El reenvío usa el de la sesión nueva | Hay que sincronizar cada login/logout con el SW |
| Norma de seguridad | Sin cambios | La rompe (JWT solo en `token-storage`) |
| Envío sin pestaña abierta | No | Solo en Chromium (Background Sync no existe en Safari ni Firefox) |

(b) solo gana en enviar con la app cerrada, y únicamente en Chromium, a
cambio de duplicar el token; (a) es claramente mejor. Tampoco se usa
Background Sync para "despertar" a la página: si no hay pestaña abierta no
hay quien envíe, y si la hay, el evento `online` ya basta.

Reglas de la cola:

- **Nunca duplica**: el reenvío lleva la misma clave que el intento original,
  así que si la primera petición sí llegó (y solo se perdió la respuesta) el
  backend devuelve el reporte original. Dentro de una pestaña hay una sola
  sincronización en curso por usuario. **Entre pestañas** puede haber una
  carrera: las dos envían el mismo reporte con la misma clave, el backend crea
  uno solo (restricción UNIQUE de la clave, ver `IdempotencyKeyService`) y la
  que pierde recibe un **500**. Ese 500 se trata como transitorio: el reporte
  queda pendiente en esa pestaña, no se duplica, y su siguiente intento recibe
  la respuesta original (201) y lo quita, si la ganadora no lo quitó antes.
  Ante otros errores, `marcarRechazado` lee y escribe en la misma transacción y
  no resucita una clave que ya no está. Las pestañas se enteran de los cambios de la cola por
  `BroadcastChannel('viasegura-cola')`.
- **Nunca se pierde**: solo sale de la cola con una respuesta 2xx o si el
  ciudadano lo descarta. Sin red, 5xx, 408 o 429, sigue pendiente.
- **Nunca sale con la sesión de otro**: `token-storage` lleva una *generación
  de sesión* que sube al guardar o borrar el token (también desde otra
  pestaña, por el evento `storage`). `/me` se pregunta tomando antes la
  generación, y el bucle de reenvío recibe esa generación (la de la sesión en
  que se identificó al usuario) y la compara **al empezar** y antes de cada
  envío; si cambió, o si la pantalla se desmontó (`AbortSignal`), se detiene
  sin enviar nada más. Además cada reporte guarda quién lo creó y solo se
  reenvía con la sesión de esa persona.
- **Un 401 tardío no afecta a otra sesión**: el cliente HTTP toma la
  generación antes del `fetch` y, ante un 401, borra el token (y redirige)
  solo si la sesión sigue siendo la misma (`borrarTokenSi`). Un 401 de una
  petición de la sesión anterior no cierra la de quien entró después.
- **«No sé quién eres» no es «no hay sesión»**: si `/me` falla por red o 5xx,
  el sincronizador no da la sesión por perdida; vuelve a preguntar al volver
  la conexión o la pestaña. Solo un 401 cuenta como sesión inválida.
- **Sesión vencida (decisión del usuario)**: un 401 conserva el reporte. El
  trabajo en segundo plano **nunca lleva al login**: el `/me` del sincronizador
  y el POST del reenvío usan `redirigirEn401: false` (el cliente borra el
  token y lanza el 401, pero no navega; el 401 sigue centralizado en
  `client.ts`). En su lugar aparece un aviso no modal: «Tienes N reportes
  pendientes de envío: inicia sesión para enviarlos», con enlace a
  `/login?redirect=<ruta actual>`. Al volver a iniciar sesión se reenvía con el
  token nuevo; mientras tanto, `mis-reportes` lo muestra como **«Pendiente de
  envío»**.
- **Límite de 48 h**: la `Idempotency-Key` vale 48 h en el backend
  (`IdempotencyKeyService.VIGENCIA_HORAS`). Pasado ese plazo el backend ya no
  la reconoce: si la primera petición sí había llegado, reenviarla crearía un
  duplicado (o una adhesión de US-09). Por eso un reporte con más de 48 h en
  cola **no se reenvía a ciegas**: queda «Caducado: revisa Mis reportes antes de
  reenviarlo», y el ciudadano puede reenviarlo con una clave nueva (es otro
  intento lógico) o descartarlo, ambas cosas con confirmación.
- **Rechazos de negocio** (otro 4xx, p. ej. fuera de cobertura): reintentar no
  cambia la respuesta, así que queda «No se pudo enviar: <motivo>» con un
  botón para descartarlo (con confirmación).
- **Dispositivo compartido**: al cerrar sesión con reportes propios en cola se
  pregunta «Tienes N reportes sin enviar en este dispositivo. Se enviarán
  cuando vuelvas a entrar. [Conservar] [Descartarlos]». `auth` no conoce la
  cola: quien compone la app registra ese paso en
  `lib/sesion/antesDeCerrarSesion.ts` (D-14) y `useCerrarSesion` lo espera. El cierre
  **nunca se cuelga**: Escape equivale a «Conservar»; si la pregunta queda
  abierta y el componente se desmonta o la cola se vacía, se responde
  «Conservar»; un segundo intento de cierre reutiliza la misma pregunta; y
  `antesDeCerrarSesion` tiene un tope de espera (2 min) tras el cual cierra
  igual. Los
  rechazados y caducados se purgan solos a los 30 días. **Riesgo aceptado**: si
  se elige «Conservar», los datos del reporte (ubicación, descripción y foto)
  quedan en el IndexedDB del navegador hasta que su dueño vuelva a entrar o
  pasen esos plazos; otra persona con acceso al dispositivo podría leerlos con
  las herramientas del navegador. No se envían con la sesión de otro (ver
  arriba), y el aviso sin sesión solo muestra la cantidad, no el contenido.
- **La foto** se guarda como `ArrayBuffer` + nombre + tipo y se rearma como
  `File` al reenviar: IndexedDB clona eso en todos los navegadores (Safari tuvo
  fallos guardando `Blob`).
- Si no hay IndexedDB (algún modo privado), el formulario avisa como antes y
  conserva la clave para el reintento manual.
- Tests: la lógica de la cola y el adaptador real de IndexedDB corren en jsdom
  con **`fake-indexeddb`** (dependencia de desarrollo): jsdom no implementa
  IndexedDB, y con un doble en memoria no se probaría el clonado de la foto ni
  el reemplazo por clave.

### Consentimiento (NC-07b, D-12)

El consentimiento es un **permiso** por finalidad y versión
(`TERMINOS_Y_PRIVACIDAD`, `NOTIFICACIONES_CORREO`, `NOTIFICACIONES_PUSH`); la
`preferenciaNotificacion` del perfil sigue siendo solo la **preferencia** de
canal. Dónde aparece:

- **Registro (US-01):** casilla obligatoria «Acepto los términos de uso y la
  política de privacidad» con enlace a `/privacidad`. Sin marcarla no se envía.
  Viajan `aceptaTerminos: true` y `versionTerminos`.
- **`/privacidad`** (pública): el texto del borrador
  `project-context/legal/terminos-y-privacidad-v1.md` copiado en
  `features/legal/components/TextoTerminosYPrivacidad.tsx`, con el aviso
  visible «Borrador pendiente de revisión», la versión y los `[COMPLETAR]` del
  original resaltados (no se inventan datos).
- **Pantalla de aceptación** (`/aceptar-terminos`, cualquier rol con sesión)
  para quien tiene `debeAceptarTerminos`: términos obligatorios y, solo para el
  ciudadano, avisos por correo y push opcionales (para push, solo el
  consentimiento; activar el navegador se hace en el perfil). Al terminar
  vuelve a `?redirect=` (validado: solo rutas internas). Llegan aquí el login,
  `GuardiaDeRol` y el cliente HTTP.
- **403 `TERMINOS_PENDIENTES` centralizado:** igual que el 401, `client.ts`
  lleva a esa pantalla (navegación dura, conserva el destino, **no** borra el
  token) ante un 403 con `ApiError.codigo === 'TERMINOS_PENDIENTES'`. Un 403
  sin código sigue siendo «sin permiso». El trabajo en segundo plano
  (`redirigirEn401: false`) tampoco navega por esto. En la cola offline ese
  403 cuenta como «sin sesión», no como rechazo: el reporte queda pendiente,
  la sincronización se detiene y se reenvía tras aceptar. `GuardiaDeRol` y
  `useSesionRequerida` llevan a la pantalla antes de pedir nada (sin bucle
  en la propia `/aceptar-terminos`). El `redirect` se valida después de
  parsear la URL (un `"/\t/otro"` o un `"/.//otro"` se convertirían en
  `//otro`): se rechaza una ruta normalizada que empiece con `//` y se vuelve
  a parsear lo que se devuelve.
- **Perfil → «Privacidad y consentimientos»:** vigentes, historial (con
  revocaciones) y otorgar/retirar correo y push. Los términos no se revocan:
  es la baja de la cuenta (§5 y §7 del borrador), y el backend responde 409.

**Versión de los términos.** El registro ocurre sin sesión y el contrato no
expone la versión vigente en ninguna ruta pública (solo con sesión, en
`ConsentimientosResponse.versionTerminosVigente`). Por eso el registro y
`/privacidad` usan la constante `VERSION_TERMINOS`
(`features/auth/model/terminos.ts`), y **`terminos.test.ts` la compara con
`app.legal.version-terminos` del `application.yml` del backend**: si alguien
cambia una sin la otra, la suite falla. Con sesión (pantalla de aceptación)
se usa la versión del API; si no coincide con la del texto que trae la app,
no se deja aceptar (no se acepta un texto que no se mostró). Si aun así el
registro recibe 409 por versión, no se creó la cuenta: se desmarca la casilla
y se pide volver a intentar en unos minutos. Publicar un texto nuevo =
cambiar el texto, la constante y la propiedad del backend en la misma entrega.

**No sobrescribir `LEGAL_VERSION_TERMINOS`** (la variable de entorno del
backend que fija `app.legal.version-terminos`) sin publicar a la vez un
frontend con ese mismo texto y esa misma versión. El test solo compara con
el valor por defecto del `application.yml`: no ve lo que se configure en un
entorno. Si el backend exige una versión que el frontend no trae, nadie
puede registrarse (409) y quien deba aceptar no puede hacerlo (la pantalla
no deja aceptar un texto que no muestra), ni escribir a Soporte, que también
queda bloqueado sin los términos.

Los avisos opcionales llevan su propia versión de texto
(`push-2026-10-v1`, `correo-2026-10-v1`, en `model/consentimientos.ts`): el
backend la guarda tal cual para saber qué texto vio el usuario.

### Notificaciones push (US-21)

Capas: reglas puras en `features/auth/model/push.ts` (base64url → bytes,
comparar la clave VAPID, textos de estado); el navegador (Service Worker,
`PushManager`, `Notification`) en el adaptador `src/pwa/push.ts`; la
orquestación en `features/auth/hooks/push.ts`, que recibe navegador y API por
parámetro y se prueba con dobles (en jsdom no hay push real). Vive en `auth`
porque la usan el perfil, el inicio y el cierre de sesión y la aceptación de
términos, todos de `auth`.

- **Activar (perfil, solo este navegador):** requiere el consentimiento
  `NOTIFICACIONES_PUSH`; si falta, el botón es «Otorgar consentimiento y
  activar aquí» (sin él, el `POST` daría 409). Orden del handoff:
  `GET /api/notificaciones/vapid-public-key` → `Notification.requestPermission()`
  → `pushManager.subscribe({ userVisibleOnly: true, applicationServerKey })`
  → `POST /api/notificaciones/suscripciones` con `subscription.toJSON()` +
  `userAgent`. Estados en pantalla: no soportado (o sin Service Worker, como
  en `next dev`), sin claves en el servidor (404: no se ofrece), permiso
  bloqueado, inactivo y activo.
- **Desactivar en este navegador:** `DELETE` de la suscripción +
  `unsubscribe()`; el permiso sigue para los demás navegadores. **Retirar el
  consentimiento** push borra en el servidor las suscripciones de todos los
  navegadores; aquí además se cancela la local.
- **Al iniciar sesión** (y al aceptar términos pendientes, porque con ellos el
  backend responde 403): si el navegador ya tiene una suscripción con permiso
  concedido, se vuelve a registrar para el usuario que entra; si se hizo con
  otra clave VAPID (rotación: el servicio de push rechaza las viejas y el
  backend no las desactiva), `unsubscribe()` + `subscribe()` con la nueva +
  `POST`. Nunca pide permiso ni crea una suscripción por su cuenta. Corre en
  segundo plano (sin navegar por un 401/403) y sin esperar. Si el navegador
  no informa la clave de la suscripción, se trata como distinta.
- **Al cerrar sesión:** el `DELETE` de la suscripción de este navegador va
  dentro de `cerrar` (`useCerrarSesion`), después de las preguntas de
  `antesDeCerrarSesion` y **antes** de `cerrarSesion()` (después sería 401).
  Antes espera al re-registro de inicio de sesión si sigue en vuelo (si no,
  ese `POST` podría llegar después de la baja y reasignar el navegador a
  quien sale). Todo dentro de un tope de 3 s; pase lo que pase, el cierre
  sigue. Si la baja responde bien, la suscripción del navegador se conserva:
  si la misma persona vuelve a entrar, el inicio de sesión la registra otra
  vez; si entra otra persona sin consentimiento push, el registro da 409 y no
  recibe nada. Si la baja **falla** por cualquier motivo (red, 401 porque el
  JWT venció con la PWA abierta, 5xx…), se hace `unsubscribe()` en el
  navegador para que el dispositivo no siga mostrando los avisos de quien
  salió. La única excepción es el 404: dice que el endpoint no es de quien
  sale (puede ser de otra persona que usó el dispositivo antes, que perdería
  su push); `darDeBajaSuscripcionPush` ya lo resuelve como éxito y la regla
  es una segunda barrera. Agotar el tope no cuenta como fallo.
- **Service Worker** (`sw.ts`): `push` muestra la notificación con el
  payload del backend (`titulo`, `cuerpo`, `url`, `tag: 'reporte-<id>'`, así
  un aviso nuevo del mismo reporte reemplaza al anterior; con un payload
  ilegible muestra un aviso genérico, porque `userVisibleOnly` obliga a
  mostrar algo); `notificationclick` enfoca la pestaña que ya está en esa
  URL, o reutiliza otra de la app navegándola, o abre una nueva. Solo rutas
  del mismo origen: una `url` absoluta o `//otro` cae a `/mis-reportes`. Se
  valida después de parsear (con `\t`, `\n` o `\r`, `"/\t/otro"` sería
  `//otro`, y lo mismo `"/.//otro"` por la normalización de puntos): se
  rechaza una ruta normalizada que empiece con `//` y se vuelve a parsear lo
  que se devuelve. El SW comprueba además el origen contra `self.location`
  antes de `openWindow` o `navigate`; si no coincide, abre `/mis-reportes`. La lógica pura está en
  `src/pwa/avisosPush.ts`, con tests. El SW sigue sin cachear `/api/`.
- **CSP:** sin cambios. La suscripción y la entrega las hace el navegador con
  su servicio de push, fuera de la CSP de la página; el SW no llama a otros
  orígenes; la clave y el registro van al API, ya en `connect-src`.

**Ver un push real en local:** el SW solo existe en el build
(`npm run build && npm run start`, en `http://localhost:3000`, que el
navegador trata como contexto seguro). El backend necesita claves VAPID por
entorno (`npx web-push generate-vapid-keys`; luego `VAPID_PUBLIC_KEY`,
`VAPID_PRIVATE_KEY` y `VAPID_SUBJECT=mailto:…` antes de
`mvn spring-boot:run`, ver `backend/README.md`). Con un ciudadano: Perfil →
«Otorgar consentimiento y activar aquí» → permitir; luego un funcionario del
distrito cambia el estado de un reporte de ese ciudadano y llega el aviso.

### Fotos: dos visibilidades

El backend devuelve `fotoUrl` **relativa** (no conoce su hostname público).
Componerla es del cliente: `urlDeFoto()` en `lib/api/client.ts`.

- **Foto de reporte** (`/media/fotos/reportes/…`) es **pública**: sirve
  directo en `<img src>`.
- **Foto de perfil** (`/api/perfiles/fotos/…`) exige `Authorization`: un
  `<img src>` plano devuelve **401**; hay que traerla con `apiFetch` y
  convertirla a `blob:`. `fotoRequiereAuth()` distingue ambos casos.

### Descargas autenticadas (US-28)

La exportación de la bandeja (`GET /api/reportes/exportar`) exige
`Authorization`, así que un `<a href>` al API no sirve. `apiDescargar()`
(`lib/api/client.ts`) la trae como `Blob` por el mismo camino que `apiFetch`
(token, 401 centralizado, `ApiError`), y el hook `useExportarReportes` la
guarda con un enlace temporal a una URL `blob:` que libera al terminar. Se
exporta con los filtros activos de la bandeja; las fechas, que la bandeja
filtra por día local, viajan como instantes con la misma semántica
(`gestion/model/exportacion.ts`).

El nombre sale de `Content-Disposition`, pero entre orígenes el navegador solo
deja leer esa cabecera si el backend la expone
(`Access-Control-Expose-Headers`). Si no puede leerse, se usa
`reportes.csv` / `reportes.xlsx`.

### Mapa

Leaflet vive encapsulado en `src/map/`; el resto de la app solo maneja
`{ latitud, longitud }`. Se carga con `dynamic(..., { ssr: false })` porque
Leaflet manipula el DOM al construirse. El marcador es un `DivIcon` de
HTML/CSS en vez de la imagen por defecto: evita el problema conocido de
iconos rotos con bundlers y no obliga a abrir orígenes extra en la CSP.

Los tiles de OpenStreetMap **sí** están listados en `img-src` de la CSP
(hosts concretos, no `*`); sin eso el mapa se ve en blanco.

### Mapa de calor (US-11): círculos de Leaflet, sin plugin

La capa de calor de `/mapa` dibuja la grilla de `GET /api/reportes/densidad`
con lo que Leaflet ya trae, **sin dependencias nuevas** (ni `leaflet.heat`
ni similares) y sin tocar la CSP: no hay orígenes nuevos.

- **Una celda = un `CircleMarker`** centrado en el nodo de la grilla (el
  backend lleva cada reporte al nodo más cercano, así que el nodo es el
  centro de la celda). El radio va en **píxeles**, no en metros: la celda
  mide ~110 m, que a la escala de la ciudad serían uno o dos píxeles. Con un
  radio fijo por nivel la capa se lee a cualquier zoom y las celdas vecinas
  se funden en manchas, como en un mapa de calor. Se descartó el
  `Rectangle` del tamaño real de la celda por eso mismo.
- **Cuatro niveles relativos al máximo de la vista** (`nivelDeCalor`: el
  cuartil de `cantidad / referencia`, ver el piso abajo), no al de toda Lima: al acercarse a un
  distrito con pocos reportes se siguen distinguiendo sus zonas, en vez de
  quedar todo en «Baja» por comparación con el centro. Al mover el mapa la
  escala se recalcula en memoria con las celdas visibles (`capaDeCalor`).
- **Con un piso de 4** (`UMBRAL_MINIMO_ESCALA`): el denominador es
  `max(máximo visible, 4)`. Una escala puramente relativa engaña con pocos
  datos: en la verificación en vivo, con todas las celdas en 1 reporte, todas
  salían «Muy alta: 1 reporte». Con el piso, un reporte aislado es «Baja» y
  hacen falta 4 en la misma zona para llegar a «Muy alta»; con más datos el
  piso deja de actuar. La leyenda lo dice («con un mínimo de 4») y solo
  muestra los niveles a los que llega alguna cantidad de la vista.
- **No solo color:** cada nivel crece en color (rampa de violetas, de claro
  a oscuro, que no se confunde con los colores de estado de los marcadores y
  se ordena también en escala de grises) **y en tamaño**. La leyenda del
  panel repite ambos y nombra cada nivel con su cantidad («Media: 3 a 5
  reportes»), el máximo de referencia y el lado de la celda. Sin celdas en la
  vista dice «Sin reportes en esta zona con estos filtros».
- **Un solo `<canvas>` para toda la capa** (renderer `canvas()` compartido
  por todos los `CircleMarker`), no un nodo SVG por celda: la capa no tiene
  tope —la grilla cubre toda Lima con los filtros dados— y con miles de
  celdas el SVG por defecto de Leaflet llenaría el DOM de nodos.
- **Accesibilidad de la leyenda:** solo los cambios de estado («Calculando
  densidad…», «Actualizando…», el estado vacío) van en la región
  `aria-live`; el total «N reportes en la vista» va aparte, porque cambia con
  cada gesto del mapa y anunciarlo sería ruido. Mientras llega una consulta
  nueva la capa anterior sigue dibujada y se avisa «Actualizando…». El nivel
  más oscuro lleva borde claro en la leyenda para verse en modo oscuro.
- Los círculos van en el `overlayPane`, debajo de los marcadores, que siguen
  siendo clicables. Las dos capas se encienden y apagan por separado
  (casillas «Capas del mapa»); apagar los marcadores no detiene la búsqueda,
  que sigue alimentando la lista.

**Cuándo se consulta** (`useDensidadMapa`): la respuesta cubre toda Lima con
los filtros dados, así que **mover o acercar el mapa no pide nada**; solo un
cambio de filtros (con el mismo debounce de 400 ms que los marcadores) o
encender la capa. Con la capa apagada no se pide nada, y con el rango de
fechas invertido tampoco. Los filtros se traducen con la misma función que la
búsqueda (`agregarFiltros` en `model/bbox.ts`), así que las dos capas no
pueden filtrar distinto. La petición va sin token y sin `cache: 'no-store'`:
el backend responde `Cache-Control: public, max-age=60` con `ETag`, y el
navegador reutiliza o revalida (304) por su cuenta al repetir una consulta
(el Service Worker deja el API en `NetworkOnly`, que respeta esa caché HTTP).
Un reporte recién creado puede tardar hasta 60 s en aparecer en la capa.

## Estado actual

Verificado end-to-end contra el backend real:

- **US-01** registro (`/registro`) · **US-02** login (`/login`).
- `/sesion` — verificación de `GET /api/auth/me`. Andamiaje: desaparece
  cuando existan las landings por rol.
- **US-05** crear reporte (`/reportar`): GPS con fallback a marcar en el mapa
  (escenario 2), captura de foto, selector de categoría que incorpora las
  personalizadas del distrito (US-29), envío multipart con `Idempotency-Key`
  (US-06) y confirmación que distingue reporte nuevo de adhesión (US-09).
- **US-10** mapa interactivo (`/mapa`), **público**: marcadores por estado con
  leyenda, filtros de distrito/categoría/estado con conteo de resultados, y
  popup con el resumen del reporte.
- **US-12** búsqueda en `/mapa`: rango de fechas desde/hasta en el panel y
  pestaña **Lista** con los mismos resultados del mapa, paginada, con enlace
  al detalle (`/reportes/[id]`).
- **US-13/14/15/22** bandeja municipal (`/bandeja`, `/bandeja/[id]`), rol
  `FUNCIONARIO_MUNICIPAL`: lista del distrito con filtros y orden, cambio de
  estado por la máquina de transiciones, asignación de responsable interno e
  historial unificado sin redactar. La bandeja trabaja con su propio tipo,
  `ReporteGestion` (`gestion/model/tipos.ts`), que es el único que trae la
  señal interna `posibleReincidencia` (SEC-02 del backend): el
  `ReporteResumen` del mapa, del detalle público y de «mis reportes» ya no la
  tipa, así que una vista pública no puede leerla ni por descuido.
- **US-25** soporte. `/soporte` (grupo `(cuenta)`, cualquier usuario con
  sesión: la guardia admite todos los roles) para abrir un ticket y ver los
  propios con su estado y la respuesta; enlazada desde «mis reportes», la
  bandeja y el dashboard. El ADMIN aterriza en `/admin/soporte`: bandeja
  paginada en el servidor, filtro por estado y respuesta en línea (al
  responder se recarga la página actual sin desmontar la lista: `useCarga`
  conserva los datos y marca `recargando` cuando se recarga con las mismas
  dependencias). Va bajo `/admin/` y no en
  `(admin)/soporte` porque dos grupos de rutas no pueden resolver a la misma
  URL, y `/soporte` ya es la del usuario. El correo y el nombre del autor
  solo existen en el tipo `TicketAdmin`, que solo usa el área ADMIN.
  `GuardiaDeRol` explica el acceso denegado según el área
  (`descripcionDeArea` en `auth/model/rutas.ts`).
- **US-29** gestión de categorías (`/categorias`, rol
  `FUNCIONARIO_MUNICIPAL`, enlazada desde la bandeja y el dashboard): las 6
  estándar de solo lectura y las propias del distrito, activas e inactivas
  con su estado escrito, para crear, editar y activar/desactivar.
  Desactivar solo deja de ofrecerla al reportar; se puede reactivar. Dos
  detalles de contrato:
  - El `PATCH /api/categorias/{id}` **reemplaza** nombre y descripción (al
    revés que el `PATCH` de reporte de US-08, que es parcial). El formulario
    parte de los valores actuales y envía siempre los dos
    (`gestion/model/categorias.ts`); borrar la descripción la deja en `null`.
  - En «editar mi reporte» (US-08), si la categoría del reporte se desactivó
    ya no viene en el catálogo: se agrega igual al selector, seleccionada y
    marcada «ya no se ofrece», y la petición solo lleva `categoriaId` si el
    ciudadano eligió otra (`reportes/model/edicion.ts`).
- **US-18/20** índice de desempeño (`/desempeno`), **público**: ranking de los
  43 distritos con tasa de resolución, tiempo promedio y satisfacción,
  ordenable por columna y filtrable por tipo de daño.
- **NC-07b** consentimiento: aceptación de términos en el registro,
  `/privacidad`, pantalla `/aceptar-terminos` y «Privacidad y
  consentimientos» en el perfil (ver «Consentimiento» en Decisiones técnicas).
  Verificado el 20/10 (v0.4.0): una cuenta anterior entra por la aceptación y
  vuelve a su destino con los consentimientos guardados con su versión.
- **US-21** notificaciones push: activar y desactivar en el perfil por
  navegador, re-registro al iniciar sesión (con rotación de claves VAPID),
  baja al cerrar sesión y avisos en el Service Worker (ver «Notificaciones
  push» en Decisiones técnicas). Verificado el 20/10 (v0.4.0) con claves VAPID
  de desarrollo y Chrome con perfil persistente: suscripción en FCM, aviso
  real mostrado por el SW con la URL del reporte, baja al cerrar sesión y
  re-registro al volver a entrar. Chrome no admite push en modo incógnito.
- **US-11** mapa de calor en `/mapa`: casillas «Capas del mapa» para
  encender y apagar por separado los marcadores y la capa de calor, que usa
  los mismos filtros del panel (distrito, categoría, estado y fechas) sobre
  `GET /api/reportes/densidad`, con leyenda de cuatro niveles en texto y el
  estado vacío «Sin reportes en esta zona con estos filtros» (ver «Mapa de
  calor» en Decisiones técnicas). Cubierto por tests de la lógica
  (`model/densidad.ts`), del hook y de la leyenda; Leaflet no se testea en
  jsdom. Verificado el 20/10 contra el backend real: la capa dibuja los
  círculos bajo los marcadores en un único canvas, y con un reporte por celda
  la leyenda dice «Baja» (piso de 4 en la escala).

### `null` no es cero

Las métricas de desempeño llegan en `null` cuando no hay datos: un distrito
sin reportes **no tiene una tasa del 0 %, no tiene tasa**. La interfaz
distingue ambos casos ("Sin datos" vs "0 %") porque confundirlos acusaría de
mal desempeño a una municipalidad que simplemente no recibió reportes. Por la
misma razón, al ordenar, los `null` van siempre al final aunque se invierta la
dirección — igual que el `NULLS LAST` del backend.

La barra de progreso usa **un solo color**, no una escala rojo-ámbar-verde:
colorear por umbrales obligaría a inventar qué tasa cuenta como "mala", un
juicio que ni el backlog ni el backend definen. El ranking y el número ya
comunican la comparación sin que la interfaz emita su propia calificación.

> **Nota de localización:** `es-PE` usa **punto** como separador decimal y
> coma para miles (`1,234.56`), a diferencia de `es-ES` (`1.234,56`). Es la
> convención peruana; los tests la fijan para que no se "corrija" a la
> española.

### La máquina de estados está en dos sitios, a propósito

`features/gestion/model/transiciones.ts` replica las transiciones válidas del
backend. La autoridad sigue siendo `EstadoReporte.puedeTransicionarA`, que
responde **409** ante una inválida; la tabla del cliente existe solo para no
ofrecerle al funcionario opciones que van a fallar.

Se acepta el riesgo de divergencia porque son seis estados con reglas
triviales —a diferencia de la geometría de distritos, donde sí se evitó
duplicar y se pregunta al backend— y porque el peor caso es ofrecer una
opción de más y mostrar el error del servidor, nunca aplicar una transición
que el backend habría rechazado.

**Diferencia deliberada:** la UI municipal no ofrece `CANCELADO`. Cancelar es
la retirada del ciudadano sobre su propio reporte (US-08); la vía municipal
para descartar es `RECHAZADO`, que exige comentario y queda auditada.

### Cómo el mapa evita saturar el backend

Dos criterios que se complementan, uno temporal y otro espacial:

1. **Debounce de 400 ms**, implementado con el propio ciclo de efectos: un
   `setTimeout` dentro de un `useEffect` cuya limpieza cancela el anterior.
   Arrastrar y hacer zoom seguido produce una sola consulta al final. Se
   escucha `moveend`/`zoomend`, nunca `move`/`zoom` — estos últimos se emiten
   en cada cuadro de la animación.
2. **Umbral de movimiento** (`requiereNuevaConsulta`, ~55 m): si el área
   apenas cambió, los reportes visibles son los mismos y no se consulta,
   aunque el gesto haya terminado.

El `maxAge` del CORS ahorra el *preflight*, no la consulta: sin esto, cada
gesto seguiría siendo una petición real.

Ambos viven en `features/reportes/hooks/useBusquedaMapa.ts` (sobre
`useCarga`), que es también donde se valida el rango de fechas: con «desde»
posterior a «hasta» no se consulta y el panel muestra el aviso.

### Búsqueda por fechas y vista de lista (US-12)

- **Día local, igual que la bandeja.** `<input type="date">` da un día sin
  zona; el backend espera instantes. `lib/types/fechas.ts` convierte «desde»
  a las 00:00 locales y «hasta» a las 23:59:59.999 locales (incluye el día
  completo). La exportación de la bandeja (US-28) usa la misma función, así
  que un rango significa lo mismo en las dos pantallas.
- **La lista pagina en el cliente sobre los resultados del mapa** (hasta 300
  del área visible), en vez de hacer otra consulta paginada: lista y mapa no
  pueden contradecirse, y no hay una segunda petición por gesto. Si el área
  supera el límite, el mismo aviso invita a acercar el mapa o filtrar.
- **La lista se dibuja encima del mapa**, que sigue montado: conserva su
  encuadre (y su área sigue definiendo los resultados) al volver a la
  pestaña Mapa. Mientras la lista está visible, el mapa queda `inert`.

**Sincronización offline (US-06, implementada después):** sin conexión, el
reporte queda en la cola de IndexedDB con su clave de idempotencia y se envía
solo al volver la señal (ver "Cola offline" en Decisiones técnicas).

Siguiente slice: **US-10** (mapa interactivo), que reutiliza el componente de
mapa en modo lectura sobre `GET /api/reportes` con bounding box.

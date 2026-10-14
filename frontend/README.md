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
│   ├── auth/  reportes/  distritos/  desempeno/  gestion/  soporte/
├── lib/
│   ├── api/                    # cliente HTTP tipado + tipos generados
│   ├── auth/                   # almacenamiento del token
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
Sobre Workbox, trae el `BackgroundSyncPlugin` que necesitará la cola de
sincronización de US-06.

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
el Service Worker de US-06 reintenta envíos en segundo plano: con bearer token
adjunta el header explícitamente y controla el reintento; con cookie
dependería de que el navegador la adjunte en contexto cross-origin, que es
justo donde las políticas son más restrictivas.

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
  responder se recarga la página actual). Va bajo `/admin/` y no en
  `(admin)/soporte` porque dos grupos de rutas no pueden resolver a la misma
  URL, y `/soporte` ya es la del usuario. El correo y el nombre del autor
  solo existen en el tipo `TicketAdmin`, que solo usa el área ADMIN.
  `GuardiaDeRol` explica el acceso denegado según el área
  (`descripcionDeArea` en `auth/model/rutas.ts`).
- **US-18/20** índice de desempeño (`/desempeno`), **público**: ranking de los
  43 distritos con tasa de resolución, tiempo promedio y satisfacción,
  ordenable por columna y filtrable por tipo de daño.

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

**La sincronización offline no está implementada** (es un slice propio de
Service Worker con cola de reintentos). Hoy, sin conexión, el formulario
avisa claramente y **conserva la clave de idempotencia**, de modo que el
reintento manual del usuario no duplica el reporte.

Siguiente slice: **US-10** (mapa interactivo), que reutiliza el componente de
mapa en modo lectura sobre `GET /api/reportes` con bounding box.

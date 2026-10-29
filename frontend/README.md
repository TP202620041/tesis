# Ciudad Viva — Frontend (PWA)

Frontend del **Sistema de crowdsourcing geoespacial para el reporte ciudadano
y la gestión municipal de infraestructura vial en Lima Metropolitana**
(Trabajo de Investigación — UPC).

Autores: León Vivas, Fabrizio Amir · Lopez Acuña, Mario Joaquin
Asesor: Reyes Silva, Patricia

## Stack

- **Next.js 16** (App Router, Turbopack) + **React 19** + **TypeScript estricto**.
- **Tailwind CSS 4** para estilos, sobre los tokens del sistema de diseño
  «Cívica» (ver «Sistema de diseño» en Decisiones técnicas).
- **lucide-react** para los iconos (empaquetados, sin orígenes nuevos).
- **Serwist** para el Service Worker (PWA offline-first).
- **openapi-typescript** para generar los tipos del API desde el contrato real.

Consume el API REST de Spring Boot del directorio hermano `../backend`.

## Cómo levantarlo (local)

```bash
# 1. Backend (en ../backend): base de datos + API
POSTGRES_PORT=5433 docker compose up -d
POSTGRES_PORT=5433 mvn spring-boot:run     # queda en :8080

# 2. Frontend (Node 24, ver .nvmrc)
cp .env.example .env.local
npm install
npm run dev                                 # queda en :3000
```

`.env.example` es la única plantilla de variables y la única que se versiona
(`.gitignore` ignora `.env*` salvo ella). Reemplaza a `.env.local.example`,
que estaba documentada pero nunca entró al repositorio porque ese mismo patrón
la ignoraba: en un clon limpio el `cp` de arriba fallaba.

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
| `node scripts/generar-iconos.mjs` | Regenera los PNG y el ICO de la PWA desde los SVG de `public/icons/`. |

## Despliegue en Vercel

- **Proyecto**: *Root Directory* `frontend/`, *framework* Next.js, rama de
  producción `main`. El *Build Command* se deja en el predeterminado: Vercel
  ejecuta el script `build` del `package.json` (`next build` + `serwist
  build`). Sobrescribirlo con `next build` a secas dejaría la PWA sin Service
  Worker.
- **Node**: `engines.node` fija `24.x`, y Vercel lo respeta por encima del
  valor del panel (despliega el último 24.x). `.nvmrc` es para nvm o fnm en
  local.
- **Variable**: `NEXT_PUBLIC_API_BASE_URL` (Production y Preview), con el
  origen HTTPS del API, sin barra final. Se **hornea en el build**: va al
  bundle del cliente y a la CSP (`connect-src` e `img-src`) que arma
  `next.config.ts`. Cambiar la URL del API exige volver a construir (un
  *Redeploy*); editarla en el panel no cambia un despliegue ya hecho. Si
  falta, está vacía o no empieza por `https://`, **el build de Vercel falla**
  con un mensaje que lo dice: sin ella la PWA quedaría apuntando a
  `localhost:8080`, rota y sin ningún aviso, y una página HTTPS no puede
  llamar a un `http://`. `next.config.ts` lo comprueba solo si `VERCEL_ENV` es
  `production` o `preview`, no con `VERCEL` a secas: `vercel env pull` deja
  `VERCEL=1` (con `VERCEL_ENV=development`) en `.env.local` y la guarda
  rompería el desarrollo local. En local y en la CI no se exige y vale el
  respaldo `http://localhost:8080`. Ver `.env.example`.
- **Variable** `NEXT_PUBLIC_TURNSTILE_SITE_KEY` (Production y Preview): la
  site key **pública** del widget de Cloudflare Turnstile (NC-08b; reemplazó
  a `NEXT_PUBLIC_RECAPTCHA_SITE_KEY`, que ya no se lee y puede borrarse del
  panel). También se hornea en el build y, si falta o está vacía, **el build
  de Vercel falla**: el backend desplegado exige el captcha y sin widget
  ningún registro pasaría. En local puede faltar (ver «Captcha en el
  registro (NC-08, Turnstile desde NC-08b)»).
- **CORS**: el backend debe aceptar el dominio de Vercel
  (`app.cors.allowed-origins`). Las *Preview* tienen una URL por despliegue,
  así que contra el API de producción solo funcionan si se agrega su origen.
- **Service Worker**: `public/sw.js` no está en git; lo genera el build. Tras
  desplegar, `/sw.js` debe responder 200 con JavaScript y `/manifest.webmanifest`
  y cada `/icons/*.png` también 200; en Chrome, *DevTools → Application →
  Manifest* no debe mostrar errores.

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
│   ├── (auth)/                 # login, registro, recuperar-password, confirmar-cuenta
│   ├── (ciudadano)/            # rol CIUDADANO — mis-reportes, reportar
│   ├── (municipal)/            # rol FUNCIONARIO_MUNICIPAL — bandeja, dashboard
│   ├── (cuenta)/               # cualquier usuario con sesión — perfil («Cuenta»), soporte
│   └── (admin)/admin/          # rol ADMIN — soporte (bandeja de tickets)
├── features/                   # lógica por dominio, no por tipo de archivo
│   ├── auth/  reportes/  desempeno/  gestion/  soporte/  legal/
│   └── <dominio>/              # components/ → hooks/ → model/ ← api.ts (ARCHITECTURE.md §5)
├── lib/
│   ├── api/                    # cliente HTTP tipado + tipos generados + catálogos compartidos
│   ├── auth/                   # almacenamiento del token
│   ├── sesion/                 # pasos que otras features registran antes del cierre de sesión (D-14)
│   └── types/domain.ts         # uniones de enums y alias de dominio
├── components/ui/              # presentacionales compartidos (Boton, Campo, Tarjeta, ChipEstado,
│                               # IndicadorSeveridad, Aviso, EstadoVacio, Icono, Logo, Dialogo)
├── map/                        # cliente de mapas encapsulado (Leaflet)
└── pwa/                        # Service Worker aislado
```

Las vistas de `app/` componen; la lógica vive en `features/`. Un componente de
`app/` no debe llamar al API directamente: pasa por `features/<dominio>/api.ts`.

**Capas (FE-09).** Dentro de cada feature, `components/` (presentación) usa
`hooks/` (aplicación), que usan `model/` (dominio, puro) y `api.ts` (el único
que toca el cliente HTTP); de otra feature solo se toma su `model/`.
`eslint.capas.mjs` lo hace cumplir en `npm run lint` como **error** desde el
25/10: un import que rompa las capas hace fallar el lint y la CI. La migración
(FE-01..FE-08) bajó los avisos de 67 a 0 antes de endurecerla.

**Títulos de página (QA-1 M-8).** Cada ruta tiene su `<title>` («Mapa de
reportes · Ciudad Viva»), que también es lo que lee el anunciador de rutas de
Next al navegar: antes diez pantallas compartían el título de la portada. La
mayoría de las páginas son de cliente y `metadata` solo se exporta desde un
componente de servidor, así que el título va en un `layout.tsx` mínimo junto a
la página (devuelve `children`); las de servidor (login, registro,
privacidad) lo exportan en la propia `page.tsx`. Ojo con los anidados: en
Next, un layout que fija `title` como texto deja a sus hijos **sin**
plantilla, así que `/bandeja` y `/mis-reportes`, que tienen un `[id]` con
título propio, lo declaran como `{ default, template: PLANTILLA_TITULO }`
(`app/titulo.ts`); si no, `/bandeja/[id]` salía «Gestión del reporte» sin
«· Ciudad Viva». `app/titulos.test.ts` recorre `src/app` y falla si una ruta
queda con el título por defecto, si dos comparten título o si un layout
padre con título no repite la plantilla.

## Decisiones técnicas

### Sistema de diseño «Cívica» (DIS-1)

El usuario eligió la dirección A, «Cívica» (21/10; `docs/diseno/README.md` y
`docs/diseno/2026-10-21-propuesta.md`): tinta azul marino `#1F3350` y blanco,
Public Sans, foco amarillo `#FFD43B` y un solo color con significado por
estado. **Se deja el celeste** (`sky-*`, `theme_color #0369a1`): un índice que
califica a las municipalidades no debería llevar un color en disputa
partidaria en Lima, menos en año electoral (propuesta §2.3). Esta es la fase 1
(sistema base); la fase 2 rehace pantalla por pantalla (mapa con hoja
inferior, reportar en pasos, bandeja con panel, portada, desempeño).

**Tokens, no colores.** `src/app/globals.css` tiene dos capas: variables
`--cv-*` con los valores de cada tema, y un `@theme inline` que las expone a
Tailwind con nombres semánticos: `bg-fondo`, `bg-superficie`,
`bg-superficie-2`, `border-linea`, `border-linea-campo` (el borde de un
control, 3:1), `text-texto`, `text-texto-2`, `bg-primario`/`text-sobre-primario`,
`text-enlace`, los mensajes (`error`, `exito`, `aviso`, `info`, cada uno con
`-fondo`, `-texto` y `-borde`), los estados (`pendiente`, `recibido`…, con
`-fondo` y `-texto`), `severidad`, `barra`/`pista` del índice, radios
(`rounded-control` 8 px, `rounded-tarjeta` 12, `rounded-hoja` 16), sombras
(`shadow-tarjeta`, `shadow-elevada`) y `min-h-objetivo` (44 px). Con `inline`
la utilidad lee la variable en ejecución: cambiar de tema es cambiar
`data-theme` en `<html>`, sin una sola clase `dark:`. Por eso:

- **La paleta por defecto de Tailwind está quitada** (`--color-*: initial`).
  Se migraron unas 1 250 clases `slate-*`, `sky-*`, `red-*`, `amber-*`,
  `emerald-*` y `white` de 57 archivos; una clase de la paleta que vuelva a
  aparecer no pinta nada y `app/sin-colores-sueltos.test.ts` la delata.
- **El contraste se prueba, no se mira.** `scripts/contraste-civica.json`
  lista 99 pares (texto/fondo, borde/superficie, foco, chips, marcadores) con
  su mínimo WCAG y los tokens de donde sale cada color. Con el script de la
  propuesta, `node ../docs/diseno/contraste/contraste.mjs
  scripts/contraste-civica.json` da **0 fallos** (texto ≥ 4.5:1 en claro y
  oscuro, ≥ 7:1 en alto contraste; bordes y foco ≥ 3:1). `app/contraste.test.ts`
  comprueba además que los colores del JSON son los que declara `globals.css`
  en cada tema: si alguien cambia un token sin volver a medirlo, falla.
- **Foco visible en todo**: amarillo de 3 px con un anillo oscuro de 2 px por
  fuera (el amarillo solo no llega a 3:1 sobre blanco). La regla va **fuera**
  de las capas de Tailwind a propósito, para ganarle a cualquier
  `outline-none` o sombra de utilidad que quede en un control.
- **Objetivos de 44 px.** Botones, controles e ítems de navegación miden 44 px.
  El botón `compacto` (tablas, paginación) baja a 36 px solo con un puntero
  fino; en una pantalla táctil (`pointer-coarse:`) vuelve a 44.

**Componentes base** (`src/components/ui/`, presentación pura): `clasesDeBoton`
y `EnlaceBoton` (primario en tinta, secundario, texto, peligro), `Campo` y el
`Boton` de envío (`form.tsx`, misma API y textos que antes), `Tarjeta`,
`Aviso` (info, éxito, advertencia, error, sin conexión), `EstadoVacio`,
`Icono`/`BotonIcono` y `Logo`. Los iconos son de `lucide-react` (ISC), versión
exacta publicada hace más de dos semanas: cada icono se importa por nombre y
queda en el bundle, así que la CSP no cambia. Un icono nunca carga solo el
sentido: va junto a un texto (y es `aria-hidden`) o en un botón solo-icono con
`aria-label` obligatorio.

**Estados: color + icono + nombre** (`ChipEstado`, propuesta §4). Pendiente en
rojo con reloj, **Recibido pasa de naranja a azul** con bandeja, En proceso en
el ámbar de las obras con llave y glifo oscuro, Resuelto en verde con visto,
Rechazado en gris con equis y Cancelado blanco con borde. Antes rojo, naranja
y ámbar se confundían con deuteranopía y los chips de texto blanco no llegaban
a 4.5:1. Como la etiqueta de GOV.UK, el chip solo indica (no es enlace ni
botón). `lib/types/estados.ts` sigue siendo dominio puro: guarda la clave de
tokens y el nombre del icono, y el componente los traduce. El marcador del
mapa usa el mismo color en los tres temas (con anillo blanco y contorno
oscuro); el color de la marca nunca es un estado. **Cambia una leyenda que ya
aparece en capturas de la tesis** (Recibido): hay que actualizarlas al cerrar
el rediseño.

**Severidad** (`IndicadorSeveridad`): tres barras crecientes en tinta, siempre
con el texto («Severidad alta»), **sin rojo**: no compite con el color del
estado ni alarma, y es una apreciación del vecino. Sin severidad no dibuja un
nivel inventado.

**Lo que no cambia** (decisiones de este README): la barra del índice y la
comparación usan **un solo color** (ahora `barra`, la tinta), la capa de calor
conserva su **rampa violeta** (ningún estado ni la marca usan violeta) y
`null` sigue siendo «Sin datos»; en la tabla del índice, además, la pista de un
«Sin datos» es punteada y la de un «0 %» llena.

**Recibido (azul) frente al calor (violeta).** Con Recibido en azul, el tono
ya no basta para separarlo del violeta medio de la capa de calor: su
luminosidad es casi igual (1.14:1 entre `#2e6be6` y `#8b5cf6`), así que ese par
**no** va en `contraste-civica.json` como si el contraste los distinguiera. Los
separan la forma y la capa: el marcador es un disco opaco de 20 px con anillo
blanco y contorno oscuro, en el `markerPane` (encima); la celda de calor es un
círculo translúcido, sin anillo, que crece con el nivel (6 a 12 px de radio),
en un `<canvas>` debajo. Cada capa tiene su leyenda con texto y la de calor se
enciende aparte. Lo dice también el comentario de `model/densidad.ts`.

**Mapa.** Las teselas de OpenStreetMap se desaturan con un filtro CSS sobre
`.leaflet-tile-pane` (en oscuro se invierten; en alto contraste, escala de
grises), para que los únicos colores con significado sean los de los
marcadores y el calor. Es CSS: **no hay orígenes nuevos en la CSP**. Los
controles, la atribución y los popups de Leaflet toman los tokens. El punto de
«Ubicación del daño» y el de la ubicación elegida al reportar pasan de rojo y
celeste al color del texto: un punto rojo se leería como «Pendiente».

### Marco común y navegación por rol (DIS-1)

Cada pantalla armaba su propia cabecera con su propio «Cerrar sesión», que
competía con las acciones (en `/reportar` era el único botón). Ahora hay un
marco común, `features/auth/components/MarcoDeLaApp.tsx`, en el layout raíz:

| Rol | Móvil (barra inferior) | Escritorio (cabecera) |
|---|---|---|
| Visitante | Mapa · Desempeño · Reportar · Entrar | Mapa · Desempeño · Iniciar sesión · Crear cuenta |
| Ciudadano | Mapa · Mis reportes · **Reportar** · Desempeño · Cuenta | lo mismo y el menú de cuenta |
| Funcionario | Bandeja · Panel · Categorías · Cuenta | «Municipalidad de X» · Bandeja · Panel del distrito · Categorías · Soporte · menú |
| Admin | Soporte · Cuenta | Tickets de soporte · menú |

- **Qué ve cada rol** está en un solo lugar, `features/auth/model/navegacion.ts`
  (con tests). Como `GuardiaDeRol`, es UX: la autoridad sigue en el backend.
- **Quién mira** lo da `useUsuarioDelMarco`, que **nunca lleva al login**: el
  marco está también en las pantallas públicas, y un token vencido en `/mapa`
  no debe sacar de ahí a quien solo miraba (lo borra y queda como visitante,
  con `usuarioActualSinRedirigir`). Pregunta `/me` una vez por sesión (el marco
  no se desmonta al navegar) y otra al iniciar o cerrar sesión. Sin red, con
  sesión, queda «sin identificar»: se ofrece lo público y la cuenta para poder
  salir (en el móvil, «Cuenta» con el aviso y «Cerrar sesión»; en escritorio,
  el menú), y vuelve a preguntar al volver la conexión. La sesión
  llega a la cabecera y a la barra por props (`ARCHITECTURE.md` §5).
- **Menú de cuenta** (escritorio; en el móvil «Cuenta» es una pantalla, ver
  «Ajustes tras la prueba en iPhone»): nombre, rol o municipalidad, enlaces de
  la cuenta, Apariencia y «Cerrar sesión». Es un desplegable (`aria-expanded`), no un
  `role="menu"`: adentro hay enlaces y radios que se recorren con Tab. Escape
  lo cierra y devuelve el foco; se cierra al tocar fuera y al navegar. «Cerrar
  sesión» usa el mismo `useCerrarSesion`: siguen las preguntas de
  `antesDeCerrarSesion` (reportes en cola), la baja de push y el tope de espera.
- La barra inferior es fija, respeta `env(safe-area-inset-bottom)` y fija
  `--cv-alto-nav`; la cabecera, `--cv-alto-encabezado`. `/mapa` ocupa el alto
  que dejan las dos (el panel provisional de QA-1 I-4 sigue igual) y los avisos
  de la cola flotan por encima de la barra. Hay un enlace «Saltar al contenido».
- Las pantallas de acceso (login, registro, recuperación) no llevan el marco:
  tienen el suyo, centrado, con el logo. La aceptación de términos lleva solo
  el logo (mientras no acepte, el resto de la app daría 403).
- «Dashboard del distrito» pasa a «Panel del distrito», como en la navegación.

#### Ajustes tras la prueba en iPhone (23/10)

- **Barra superior al estilo iOS.** El usuario pidió «el scroll de WhatsApp»:
  al bajar, el título de la pantalla se centra en la barra y lo que pasa por
  debajo se ve difuminado, sin tapar la hora ni la batería. Comparó cuatro
  efectos en un prototipo (barra de cristal, borde difuminado, título que
  viaja, barra que se esconde) y eligió la **barra de cristal**. La cabecera
  es fija y, en el móvil, translúcida (`.cv-translucida`: tinta al 70 % y
  `backdrop-filter`; al 85 %, la primera versión, el difuminado casi no se
  notaba). A medida que el `<h1>` de la pantalla pasa bajo la barra, su texto
  entra centrado, el logo se va y aparece la línea fina inferior, **ligado al
  dedo** y no con un fundido de tiempo fijo (`useTituloAlDesplazar` escribe el
  avance como `--cv-avance-titulo`, sin un render de React por cuadro). Las
  pantallas no cambian. La copia es `aria-hidden`: el lector ya tiene el `<h1>`.
- **Por qué tinta y no clara.** Para que la página siga bajo la hora y la
  batería, la PWA declara `viewport-fit=cover` y `black-translucent`, e iOS
  pinta esos íconos **siempre en blanco**. Una barra clara los borraría; el
  usuario eligió la barra tinta entera (también en el tema claro) sobre una
  franja tinta con cabecera clara. Blanco sobre tinta al 70 % encima de
  contenido blanco da 5,03:1 (`scripts/contraste-civica.json`). En alto
  contraste la barra es opaca; también donde el navegador informa
  `prefers-reduced-transparency` (sin verificar en Safari, que podría no
  exponerlo). En escritorio
  la cabecera sigue clara y solo la franja de la hora (iPad) va en tinta.
- **Zonas seguras.** Con `viewport-fit=cover` la página llega a los bordes:
  `--cv-alto-encabezado` y `--cv-alto-nav` incluyen `env(safe-area-inset-*)`,
  el marco reserva los laterales (el teléfono girado) y las pantallas de
  acceso, que no tienen cabecera, llevan una franja tinta bajo la hora.
- **Sin verificar:** iOS 26.1 tuvo una regresión que dejaba la barra de
  estado opaca en las PWA ([WebKit 301994](https://bugs.webkit.org/show_bug.cgi?id=301994)).
  Si pasa, el título compacto y el difuminado siguen funcionando; solo la
  página no llega bajo la hora.
- **«Cuenta» es una pantalla.** En el móvil, la hoja del menú de cuenta
  ocupaba media pantalla. Un primer arreglo la llevó a pantalla completa como
  panel encima, y el usuario lo descartó: «Cuenta» tiene que seguir las mismas
  reglas que las demás pantallas. Ahora el ítem de la barra (`CUENTA` en
  `model/navegacion.ts`) lleva a `/perfil`, con la barra de cristal y el
  título grande de siempre, y queda marcado también en `/soporte`.
  - El ciudadano ve su perfil (US-30), que termina en «Otras opciones»
    (`AccionesDeLaCuenta`): Soporte y «Cerrar sesión». Ya no lleva «Volver a
    mis reportes», porque es un destino de la barra.
  - El funcionario y el ADMIN no tienen perfil editable: el backend solo
    acepta `PATCH /api/auth/me` del ciudadano. En la misma ruta ven `MiCuenta`:
    quiénes son, la apariencia, sus enlaces y «Cerrar sesión». La ruta pasó
    del grupo `(ciudadano)` a `(cuenta)`; la URL no cambia.
  - En escritorio sigue el desplegable de la cabecera.
- **Volver a donde se estaba.** Al volver de «Soporte» a «Cuenta», la
  pantalla quedaba en blanco hasta mover el dedo. Las pantallas cargan sus
  datos al montarse: un momento miden poco más que «Cargando…», y el
  navegador devolvía la posición antes de que el contenido llegara tan abajo.
  Chrome la dejaba arriba; Safari en iOS, más allá del contenido.
  - El marco se queda con la restauración (`useMemoriaDeDesplazamiento`,
    `history.scrollRestoration = 'manual'`).
  - Anota la posición al irse: un clic en un enlace, o atrás/adelante.
  - Al volver, empieza arriba y baja a la posición anotada en cuanto la
    página mide lo suficiente. Vale para atrás/adelante y para tocar el
    destino del que se venía (`esRegresoDentroDeSuDestino`: de «Soporte» a
    «Cuenta», del detalle a «Mis reportes» o a la bandeja), como las
    pestañas de iOS.
  - Si la persona se mueve antes, no se le quita el control.
  - Ir a otro destino deja la pantalla arriba, como siempre.
  - Sin red, `/perfil` no lleva al login como las demás pantallas con
    sesión, porque `GuardiaDeRol` tomaría el fallo de `/me` como «sin
    sesión» y en el móvil no quedaría cómo salir. `PantallaDeCuenta`
    pregunta primero como el marco: sin identificar, muestra el aviso, la
    apariencia y «Cerrar sesión», que funciona sin red (revisión de
    arquitectura).

### Apariencia: claro, oscuro, alto contraste o sistema (US-23)

- **Selector** «Apariencia: Sistema · Claro · Oscuro · Alto contraste» en el
  perfil (con la descripción de cada opción) y en el menú de cuenta (para
  todos los roles). Es un grupo de radios nativos con su `<legend>`; aplica en
  el acto.
- **Preferencia del dispositivo**, no de la cuenta: va en `localStorage`
  (`viasegura.apariencia`), siempre con try/catch (sin almacenamiento, vale en
  memoria mientras dure la pestaña), y se sincroniza entre pestañas por el
  evento `storage`. No viaja al backend: no hay nada que guardar ahí.
- **Antes de pintar**: `public/tema.js`, un script síncrono del mismo origen
  en el `<head>` del layout raíz, fija `data-theme` en `<html>` mientras el
  navegador lee el HTML, así que no hay un cuadro en claro antes del oscuro.
  Síncrono a propósito: un `next/script` `beforeInteractive` se descarga antes
  pero no bloquea el pintado (por eso la regla `no-sync-scripts` se desactiva
  en esa línea, con el motivo). **No lee cookies**: leerlas en el layout raíz
  lo volvería dinámico. **CSP sin cambios**: `script-src 'self'` ya permite un
  archivo propio y no hace falta otro `'unsafe-inline'`. `<html>` lleva
  `suppressHydrationWarning` porque el servidor no puede saber el tema.
- **«Sistema»** respeta primero `prefers-contrast: more` (es una necesidad, no
  un gusto) y después `prefers-color-scheme`, y sigue los cambios del sistema
  mientras la app está abierta. Con `forced-colors` manda el sistema operativo.
- `tema.js` repite las reglas de `features/auth/model/apariencia.ts` en
  JavaScript plano (corre antes que el bundle). `apariencia.test.ts` lo
  ejecuta tal cual se sirve con cada combinación de preferencia guardada y
  sistema, y exige el mismo tema que el modelo.
- **Alto contraste**: negro sobre blanco (21:1), secundario `#262626`, enlace
  `#00308F`, bordes de 2 px y chips de estado con contorno negro (el estado lo
  cargan el icono y el nombre).

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

`@serwist/cli` compila `src/pwa/sw.ts` con **esbuild**, pero lo declara como
dependencia *peer* **opcional** (`>=0.25.0 <1.0.0`): npm no lo instala solo, y
sin él `npm run build` falla en el paso `serwist build` («This command needs
esbuild»). Por eso `esbuild` es una `devDependency` con versión exacta.

**El API nunca se cachea** (`NetworkOnly` para `/api/**`, antes de
`defaultCache`): su regla `cross-origin` guardaría respuestas que dependen del
usuario (`/api/auth/me`, `mis-reportes`, `mi-distrito`) y el siguiente usuario
del dispositivo podría recibirlas offline. Al cerrar sesión (US-04) además se
borra esa caché, por si la llenó una versión anterior del SW
(`src/pwa/cachesDeSesion.ts`).

### Marca, iconos de la PWA y tipografía

**Marca «Cívica» (DIS-1).** Un pin cruzado por una calle con su línea
amarilla discontinua, en tinta `#1F3350` (`docs/diseno/marca/`). Los iconos
provisionales de DEP-06 (un pin celeste) se reemplazaron por
`icono-pwa-a.svg` e `icono-pwa-a-maskable.svg`, copiados a `public/icons/` con
su comentario de origen, y los PNG y el ICO se regeneraron con
`node scripts/generar-iconos.mjs`; la insignia de push es la silueta del pin
con la calle calada. El manifest pasa a `theme_color #1F3350` y
`background_color #F5F6F8` (el fondo claro de la app). En la interfaz, el logo
es `components/ui/Logo.tsx`: **un solo componente para los tres temas**, porque
toma el pin y la calle de `--cv-marca` y `--cv-marca-calle` (tinta sobre
claro, claro sobre oscuro como `marca-a-oscuro.svg`, negro en alto
contraste); cada instancia recorta la calle con su propio `clipPath` (`useId`).

La estructura viene de DEP-06 y no cambió: reemplazar la identidad es
reemplazar los SVG de `public/icons/` y correr `node scripts/generar-iconos.mjs`:

- **`any` y `maskable` por separado** (`src/app/manifest.ts`). Un mismo PNG no
  sirve para ambos: el `maskable` necesita fondo a sangre y el dibujo dentro de
  la zona segura (círculo de radio 40 %), porque Android lo recorta en círculo
  o gota; usado como `any`, en cambio, se vería con un margen excesivo. Las
  fuentes son `public/icons/icono.svg` y `public/icons/icono-maskable.svg`.
- **`apple-icon.png` opaco y a sangre** (convención de archivo de Next en
  `src/app/`, que emite el `<link rel="apple-touch-icon">`): iOS rellena de
  negro la transparencia y redondea las esquinas por su cuenta.
- **`favicon.ico` con PNG de 16, 32 y 48 px** dentro del ICO.
- **Avisos push con icono e insignia** (`src/pwa/avisosPush.ts`): el icono es
  `icon-192.png`; la insignia, `badge-96.png`, que sale de
  `public/icons/icono-badge.svg` (la silueta del pin en blanco sobre
  transparente), porque Android solo usa el canal alfa de la insignia para la
  barra de estado y un icono a color se vería como un cuadrado lleno.
- Dos tests evitan que vuelva a pasar lo que motivó DEP-06 (el manifest
  declaraba iconos que no existían y nada fallaba): `src/app/manifest.test.ts`
  y `src/pwa/avisosPush.test.ts` comprueban que cada icono declarado está en
  `public/` y que el PNG mide lo que dice `sizes`, leyendo ancho y alto del
  encabezado `IHDR`, sin dependencias.
- **Sin `orientation` en el manifest.** El scaffold fijaba `portrait`, que
  bloquea la rotación de la PWA instalada: quien tiene el teléfono montado en
  horizontal (en una silla de ruedas, por ejemplo) no podría usarla, y eso
  incumple WCAG 2.1, criterio 1.3.4 (Orientación). Sin el campo, la app sigue
  la orientación del dispositivo.
- Los PNG se versionan en vez de generarse en cada build: el script usa
  `sharp`, que Next instala como dependencia opcional, y un build de Vercel no
  debería depender de ella. No se agregó ninguna dependencia.

**Tipografía (DIS-1)**: **Public Sans** (OFL; la de USWDS, derivada de
Libre Franklin), la de la dirección «Cívica». `layout.tsx` la carga con
`next/font/google` en la variable `--font-public-sans`, y `--font-sans` del
`@theme` de Tailwind la toma de ahí (el preflight la aplica a `html`). Es una
fuente variable: un solo archivo cubre todos los pesos. Reemplaza a Geist y
Geist Mono, que se quitaron; `font-mono` (versiones de los términos,
coordenadas) usa la monoespaciada del sistema. El `body` del scaffold fijaba
`font-family: Arial` fuera de toda capa (`@layer`) de Tailwind, así que ganaba
siempre y la app se veía en Arial; esa línea se quitó en DEP-06.

Se usa **`next/font/google`** y no `next/font/local` con los archivos en el
repo: no agrega dependencias ni binarios que mantener, y la fuente es de
Google Fonts. El costo es que **el build necesita red** para descargarla (en
Vercel y en la CI la hay; un build sin conexión falla con «Failed to fetch
`Public Sans` from Google Fonts», mientras que `next dev` solo avisa y usa la
fuente de respaldo). En ejecución, en cambio, **el navegador no llama a
Google**: `next/font` autoaloja la fuente en los estáticos de la app y la
sirve desde el propio origen, así que a la CSP le basta `font-src 'self'`.
Si alguna vez el build debe correr sin red, la salida es `next/font/local`
con los `.woff2` de Public Sans en el repo.

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
- **Incompletos (NC-02)**: un reporte guardado por la versión anterior, sin
  título ni severidad, no se reenvía solo ni se purga; el ciudadano lo completa
  con la misma clave (ver «Título y severidad del reporte (NC-02)»).
- **Dispositivo compartido**: al cerrar sesión con reportes propios en cola se
  pregunta «Tienes N reportes sin enviar en este dispositivo. X se enviarán
  cuando vuelvas a entrar. [Conservar] [Descartarlos]». Desde NC-02 el texto
  separa los que se envían solos (`pendiente`) de los que necesitan acción
  (incompletos, rechazados, caducados: «no se enviarán solos…»): no se promete
  enviar lo que no se envía (`desglosar` en `model/colaOffline.ts`). `auth` no conoce la
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

### Título y severidad del reporte (NC-02)

El backend agregó dos datos que declara el ciudadano: un **título** (obligatorio,
de 5 a 120 caracteres tras el trim) y una **severidad** (`BAJA < MEDIA < ALTA`).
Contrato en `project-context/handoffs/2026-10-20-titulo-severidad-reporte.md`.

- **Mismas reglas que el backend, contadas igual.** `model/titulo.ts` cuenta
  *code points* (`[...titulo.trim()].length`), como `Reporte.normalizarTitulo`
  y el `CHECK` de V17: un emoji es 1 carácter para el backend y 2 para
  `'😀'.length`. Por eso el `<input>` del título **no lleva `maxLength`** (el
  navegador cuenta unidades UTF-16 y cortaría títulos válidos); el límite se
  valida antes de enviar y un contador muestra el largo. El título se envía
  recortado, como lo guarda el backend.
- **La severidad no tiene valor por defecto.** Tres radios, ninguno marcado al
  empezar: un valor preseleccionado se enviaría sin que el ciudadano lo haya
  decidido y sesgaría el dato hacia ese valor. `MEDIA` solo la usó la
  migración para rellenar los reportes existentes.
- **Edición en PENDIENTE (US-08).** El `PATCH` es parcial: título, severidad y
  categoría viajan **solo si cambiaron** (`cambiosDeEdicion`). Así un título
  que el ciudadano no tocó nunca provoca un 400, y uno cambiado se valida
  antes de enviarlo.
- **El funcionario los ve, no los edita.** La bandeja y el detalle de gestión
  los muestran; no hay endpoint de gestión que los cambie.
- **`null` → «Sin título».** El único caso en que llegan vacíos es el reenvío
  idempotente de un envío que el backend procesó antes de NC-02 (devuelve la
  respuesta guardada entonces). `lib/types/tituloYSeveridad.ts` muestra
  «Sin título» y omite la severidad en vez de romper, como `estiloDeEstado`
  con un estado desconocido. Vive en `lib/types` porque lo usan `reportes` y
  `gestion`.
- **Adhesión (US-09): se muestran los de la respuesta.** Si el `POST` termina
  sumándose a un reporte cercano, el backend descarta el título y la severidad
  enviados y devuelve los del reporte existente. La confirmación muestra esos
  y avisa que los escritos no se usaron: presentar como propio un título que no
  quedó registrado sería engañoso.

#### Cola offline: el estado «incompleto»

La cola puede tener reportes armados por la versión anterior del formulario,
**sin** título ni severidad. El backend los rechaza con 400 si nunca llegaron
(y si llegaron, la misma `Idempotency-Key` devuelve el original sin exigirlos).
Decisión del usuario (20/10):

- **Se deduce, no se migra.** `estaIncompleto` mira los datos guardados (título
  inválido o severidad ausente). No hay campo nuevo ni versión nueva de
  IndexedDB: un `onupgradeneeded` que recorra la cola es código que corre una
  sola vez en cada navegador, en el peor momento (al abrir la app) y sin forma
  de reintentarlo; deducirlo es puro y se prueba con un test de modelo.
- **No se reenvía solo.** `seReenviaSolo` lo excluye y, además,
  `comoNuevoReporte` devuelve `null` para un incompleto: la petición no se
  puede armar, así que tampoco se puede enviar por descuido. Reenviarlo a
  ciegas daría 400 (o, si la clave ya estaba registrada, un 201 que tampoco
  necesita el título).
- **No se purga.** El ciudadano no eligió dejarlo así; solo sale de la cola si
  lo completa y se envía, o si lo descarta. Tiene prioridad sobre
  `rechazado`: un reporte que la versión anterior ya intentó enviar y recibió
  el 400 por faltar estos campos también se puede completar.
- **Se completa en «Pendiente de envío»** (Mis reportes): título sugerido
  «<categoría> en <distrito>» (el formato con que V17 rellenó los reportes
  existentes; el distrito se pregunta al backend con las coordenadas y la
  categoría sale del catálogo de ese distrito) pero **exigido**: se puede
  editar y se valida igual. Si la sugerencia no se puede armar (sin red, fuera
  de cobertura, categoría desactivada) el campo queda vacío. La severidad
  tampoco trae valor por defecto aquí.
- **Misma clave, una transacción.** `completar(clave)` lee y escribe en la
  misma transacción de IndexedDB, conserva la `Idempotency-Key` y `creadoEn`, y
  lo deja `pendiente`; si la clave ya no está (otra pestaña lo envió o se
  descartó) no lo resucita. Nunca se regenera la clave: si la primera petición
  sí había llegado al backend, el reenvío con la misma clave devuelve el
  reporte original en vez de duplicarlo. Por lo mismo, un incompleto con más de
  48 h pasa a **«Caducado»** al completarlo, con su flujo de siempre (revisar
  Mis reportes antes de reenviarlo con clave nueva).
- **Un 400 nunca borra un reporte de la cola**: lo marca `rechazado` con el
  motivo (como antes) y solo el ciudadano lo descarta.
- **Si ya no está incompleto, `completar` no escribe**: otra pestaña pudo
  completarlo (y quizá enviarlo) con otros datos; pisarlo cambiaría lo que ya
  está en camino. Devuelve `false` y la pantalla lo dice.
- **El aviso dice qué falta** (título, severidad o ambos) y es texto fijo, no
  una alerta: solo el error al completar se anuncia con `role="alert"`. Los
  campos con error quedan `aria-invalid` y enlazan su mensaje con
  `aria-describedby` (el título en el `<input>`, la severidad en el
  `<fieldset>`).
- **Aviso con sesión.** Fuera de Mis reportes, si el usuario con sesión tiene
  reportes incompletos aparece un aviso no modal («Tienes N reportes sin enviar
  a los que les faltan datos: complétalos en Mis reportes») con enlace a
  «Pendiente de envío». Lo compone `app/SincronizadorDeReportes.tsx` con
  `useCantidadDeIncompletos`; sin sesión sigue el aviso de siempre, que solo
  cuenta los reenviables. Se puede **cerrar** por el resto de la sesión de la
  pestaña (`sessionStorage`, o en memoria si no está disponible) y vuelve si
  aparecen más incompletos; va un poco más arriba del borde para no tapar la
  atribución de OpenStreetMap en `/mapa` en el móvil.
- Tests: un incompleto nunca se envía sin completar (ni pendiente ni
  rechazado); al completarlo usa la misma clave y la sincronización automática
  lo envía; un 400 lo conserva; no se purga a los 30 días; completarlo pasadas
  48 h no lo reenvía a ciegas; `completar` sobre uno ya completo no escribe.

### Sugerencia de la categoría por la foto (NC-04)

Al elegir la foto en `/reportar`, la PWA la envía a `POST
/api/clasificaciones` y muestra el tipo de daño que sugiere, o que no hay
sugerencia. El servidor no guarda nada, y el reporte se crea con la categoría
que elija el ciudadano. La sugerencia oficial la recalcula el backend sobre la
foto guardada (D-08), así que de la vista previa no se reenvía nada. El
contrato está en `project-context/handoffs/2026-10-25-clasificacion-vista-previa.md`.
Hasta NC-04b el backend usa el clasificador falso, y en producción responde
siempre «sin sugerencia». Con el modelo real (v0.8.0) el contrato no cambia.

- **Solo propone; nunca elige sola.** El handoff sugería *preseleccionar* la
  categoría cuando el selector estuviera vacío. Aquí no se preselecciona: la
  sugerencia aparece bajo el selector («Sugerencia por la foto: Bache. Es
  automática: el tipo de daño lo eliges tú.») con un botón **«Elegir
  «Bache»»**, y el selector solo cambia con ese toque o eligiendo a mano.
  Hay tres razones:
  - La decisión tiene que ser del ciudadano, y verse así (DS 016-2024-JUS,
    art. 6.1). El texto lo dice.
  - Es el mismo criterio que la severidad sin valor por defecto (NC-02): un
    valor preseleccionado se envía sin que nadie lo decida y sesga el dato.
  - La tesis evalúa la IA comparando la categoría sugerida con la confirmada
    (OE3, por SQL). Una preselección aceptada por inercia contaría como
    confirmación e inflaría el acierto.

  Cuesta un toque más. Si el usuario prefiere la preselección del handoff, el
  cambio es local: aplicar la sugerencia cuando el selector esté vacío, en
  `FormularioReporte` (las reglas de `model/sugerencia.ts` ya distinguen
  «elegida» de «propuesta»).
- **No pisa lo elegido.** Si la respuesta llega después de que el ciudadano
  eligió otra categoría, su elección queda y la sugerencia se ofrece con el
  mismo botón. Si eligió la misma, el texto lo dice y no hay botón. Si la
  categoría sugerida no está en el catálogo que tiene la PWA (desfase de
  caché), se ignora y cuenta como «sin sugerencia».
- **Catálogo que carga o que falla.** `useCategoriasDeReporte` devuelve, además
  de la lista, si está `cargando`, `listo` o `fallido`: la lista vacía sola no
  lo distingue. Mientras carga (al montar o tras un cambio de distrito), la
  sugerencia se sigue mostrando sin el botón y con el mismo texto, para no
  volver a anunciarla. Si el catálogo no se pudo traer, queda «sin
  sugerencia»: no hay contra qué validarla ni cómo elegirla.
- **Aviso antes de elegir.** La foto sale hacia el servidor apenas se elige,
  así que la ayuda del campo lo dice de antemano: «Al elegirla, la analizamos
  automáticamente para sugerirte el tipo de daño. La decisión es tuya.» Va
  junto a «JPG, PNG o WEBP, de hasta 10 MB.» y también describe el campo
  (`aria-describedby`).
- **La foto va antes del tipo de daño.** El orden queda ubicación → foto →
  tipo → título → severidad → descripción. Con la foto debajo del selector, la
  sugerencia llegaría a un campo que el ciudadano ya pasó. El prototipo de la
  fase 2 (`/reportar` en pasos) pone la foto en el paso 3, después del tipo.
  Con NC-04, el asistente tiene que pedirla antes del tipo o en el mismo paso.
- **Nunca bloquea.** El selector y «Enviar reporte» siguen habilitados
  mientras se analiza. Se hace una sola petición por foto elegida, sin
  reintentos y sin cola offline. Un fallo de red, un 5xx, un 401, el 413 o la
  espera agotada quedan en «sin sugerencia», que no se distingue de «el modelo
  no vio un daño claro». El único error que se muestra es el **409**: la foto
  no es una imagen válida, y el envío fallaría igual. Se avisa junto a la foto,
  con el campo `aria-invalid`, para que el ciudadano la cambie o la quite.
- **Sin carreras.** `useSugerenciaDeCategoria` cancela con `AbortController`
  la petición de la foto anterior al elegir otra, al quitarla, al desmontarse
  el formulario y al enviar el reporte (`descartar()`: si la respuesta no
  llegó, ya no se muestra). Si el envío falla y el ciudadano sigue en el
  formulario (409 por duplicado o por categoría inactiva, 400), `reanudar()`
  vuelve a pedir la vista previa de esa foto, solo si `descartar()` la había
  cancelado: si ya había llegado, o si la foto cambió entretanto, no se pide
  otra vez. Además, cada resultado queda atado a **su** `File`,
  y el estado se deriva comparándolo con la foto actual, así que una respuesta
  vieja nunca aparece con la foto nueva. No va sobre `useCarga`, por tres
  motivos:
  - compara sus dependencias por JSON, y un `File` serializa como `{}`;
  - no cancela la petición;
  - traduce los errores a texto, y aquí hace falta el `status`.
- **Espera máxima de 20 s** (`ESPERA_MAXIMA_DE_SUGERENCIA_MS`), subida
  incluida. El servidor corta la inferencia a los 3 s, pero en una red móvil
  la subida de una foto de varios MB puede tardar más. Pasado ese tiempo se
  cancela y queda «sin sugerencia», en vez de un «Analizando…» que no termina.
- **`redirigirEn401: false`.** La vista previa es una ayuda que el ciudadano no
  pidió. Con la sesión vencida, no debe tirar el formulario a medio llenar con
  una navegación al login, ni con el 403 de términos pendientes. El token se
  borra igual, y el envío del reporte, que sí es la acción del ciudadano, lleva
  al login como siempre.
- **La foto viaja dos veces** (vista previa y reporte). No se reduce en el
  cliente antes de la vista previa: D-08 se apoya en que la misma foto dé la
  misma sugerencia que vio el ciudadano, y una foto reescalada podría dar otra.
- **Accesibilidad.** El texto («Analizando la foto para sugerirte un tipo de
  daño…», la sugerencia o «No hay una sugerencia para esta foto…») va en una
  región `role="status"` que existe siempre, también vacía: una región que
  aparece junto con su texto no la anuncian todos los lectores. El botón queda
  fuera de la región, para que el anuncio sea solo el texto. El selector la
  referencia con `aria-describedby`. Al tocar «Elegir …» el botón desaparece y
  el foco pasa al selector, que anuncia la categoría elegida.
- **Sin porcentajes.** El API no devuelve confianza ni versión del modelo, a
  propósito: es una señal interna. La UI tampoco la infiere.
- **Tipos.** `ClasificacionResponse` (`lib/types/domain.ts`) es un alias de
  `Schemas['ClasificacionResponse']` con la nulabilidad real (los dos campos
  siempre vienen, `null` sin sugerencia). En NC-04 se escribió a mano porque
  el `openapi.json` de entonces era anterior al endpoint; el spec ya lo trae
  y en NC-09 pasó a alias.
- **Fuera de alcance aquí:** el aviso de privacidad sobre el análisis
  automático de la foto (términos v2 y `/privacidad`). Va en otra tarea, con el
  texto legal.

### Consentimiento (NC-07b, D-12)

El consentimiento es un **permiso** por finalidad y versión
(`TERMINOS_Y_PRIVACIDAD`, `NOTIFICACIONES_CORREO`, `NOTIFICACIONES_PUSH`); la
`preferenciaNotificacion` del perfil sigue siendo solo la **preferencia** de
canal. Dónde aparece:

- **Registro (US-01):** casilla obligatoria «Acepto los términos de uso y la
  política de privacidad» con enlace a `/privacidad`. Sin marcarla no se envía.
  Viajan `aceptaTerminos: true` y `versionTerminos`. La casilla **solo** se
  desmarca si el 409 es por términos desactualizados (QA-1 M-2): un correo ya
  registrado, un error de validación o de red no cambian el texto aceptado, y
  obligar a marcarla de nuevo solo estorbaba. El campo de contraseña dice
  «Mínimo 8 caracteres.» antes de enviar (`aria-describedby`) y el largo se
  valida en el cliente: el 400 del backend llegaba como «password: el tamaño
  debe estar entre 8 y 72», con el nombre del campo en inglés.
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

### Captcha en el registro (NC-08, Turnstile desde NC-08b)

El registro pide la verificación «No soy un robot» de **Cloudflare
Turnstile**. El backend verifica el token con la clave secreta
(`CAPTCHA_TIPO=turnstile`, contra `siteverify` de Cloudflare); la PWA solo
pinta el widget y manda `captchaToken` en `POST /api/auth/registro`. El
contrato no cambió al pasar de reCAPTCHA v2 a Turnstile.

- **Reemplaza a reCAPTCHA v2 por completo** (decisión del usuario, 28/10):
  no quedan su código, su variable ni los orígenes de Google en la CSP. En
  modo *Managed* Turnstile casi siempre se resuelve solo, sin casilla ni
  desafío de imágenes.
- **Sin librería** (`@marsidev/react-turnstile` y similares): es una sola
  pantalla y bastan tres llamadas (`render`, `reset`, `remove`). Así no se
  suma peso ni una dependencia más que auditar, y quedan bajo control propio
  la carga del script (una sola vez por documento, aunque StrictMode monte
  el efecto dos veces: `hooks/useCaptcha.ts`), el momento del reset y los
  orígenes de la CSP. La lógica pura (site key, URL del script, idioma,
  tamaño del widget, mensajes) está en `model/captcha.ts`.
- **Renderizado explícito.** El script es la URL exacta que publica
  Cloudflare, `https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit`:
  Cloudflare avisa que servirlo desde otro lado o cachearlo rompe el widget
  cuando lo actualizan. Se espera al `load` del `<script>` y no a
  `turnstile.ready()`, que `api.js` rechaza con un error cuando el script se
  cargó de forma asíncrona (y todo `<script>` insertado desde JavaScript lo
  es; no está en la guía, se ve en el código de `api.js`, ver la nota de
  abajo). Si `turnstile.render` lanza o no devuelve id, se muestra el mismo
  aviso que cuando el script no carga. Al desmontar se llama a `turnstile.remove`, que detiene los
  reintentos y las renovaciones del widget.
- **Callbacks.** `callback` entrega el token; `expired-callback` (el token
  vence a los 300 s; Turnstile renueva solo y vuelve a llamar a `callback`)
  y `error-callback` lo borran. El `error-callback` no marca el error como
  atendido: Turnstile lo anota en la consola y reintenta solo. Con
  `response-field: false` no agrega el `<input hidden>` que pondría dentro
  del formulario: el token ya viaja por `callback`. Textos con
  `language: 'es'` (en español Turnstile solo admite `es` y `es-es`).
- **Sin site key no hay widget.** `NEXT_PUBLIC_TURNSTILE_SITE_KEY` es
  opcional en local: sin ella el formulario no muestra el widget ni manda
  token, porque el backend local corre con `CAPTCHA_TIPO=ninguno` y lo
  ignora. Así el desarrollo y los tests no dependen de Cloudflare. Para ver
  el widget en local están las **claves de prueba** de Cloudflare (en
  `.env.example`), que funcionan en cualquier dominio y nunca van a
  producción: `1x00000000000000000000AA` (siempre aprueba),
  `2x00000000000000000000AB` (siempre falla) y `3x00000000000000000000FF`
  (obliga a un desafío interactivo). Dan el token ficticio
  `XXXX.DUMMY.TOKEN.XXXX`, que solo pasa con una secreta de prueba en el
  backend (`1x0000000000000000000000000000000AA`) y con `CAPTCHA_HOSTNAMES`
  vacía, como está fuera del perfil `prod`: las claves de prueba responden
  el *hostname* `example.com`. En producción el backend solo acepta tokens
  resueltos en `ciudadviva.app` y `www.ciudadviva.app` (`docs/despliegue.md`
  §5.2). En Vercel la variable es obligatoria (ver «Despliegue en Vercel»).
- **Reset tras cada error.** El token es de un solo uso: el backend lo
  gasta al verificarlo, aunque después el registro falle por otra causa
  (correo duplicado, validación). Por eso, tras **cualquier** error del
  registro, el formulario borra el token y sube un contador (`reinicios`)
  que hace `turnstile.reset`; reenviar exige una verificación nueva (en modo
  Managed suele resolverse sola). Se eligió un contador como prop y no una
  ref imperativa porque el formulario ya reacciona al error cambiando
  estado. La casilla de términos conserva su regla (QA-1 M-2). Los 409 y 503
  del captcha se muestran con `mensajeDeError`, como cualquier otro error:
  la PWA no decide nada por el texto del mensaje.
- **Móvil.** El widget normal mide 300 × 65 px fijos; si el contenedor es
  más angosto se pinta el `compact` (150 × 140 px), y el contenedor lleva
  `overflow-x-auto` como red de seguridad para que nunca desborde el
  formulario.
- **Accesibilidad.** El widget es un iframe de Cloudflare con su propia
  etiqueta y manejo de teclado; la PWA lo agrupa con el nombre accesible
  «Verificación «No soy un robot»» y, si se envía sin token, muestra en línea
  «Completa la verificación «No soy un robot» antes de crear la cuenta.»
  (`role="alert"`, ligado al grupo con `aria-describedby`).
- **Sin red.** Si el script no carga (o carga sin dejar `window.turnstile`)
  se muestra «No se pudo cargar la verificación. Revisa tu conexión y
  recarga.» (`role="alert"`) en lugar de un hueco vacío.
- **CSP** (`next.config.ts`): `https://challenges.cloudflare.com` en
  `script-src` (`api.js`), `frame-src` (el iframe del widget; sin la
  directiva rige `default-src 'self'` y queda en blanco) y `connect-src`.
  La referencia de CSP de Turnstile pide las dos primeras, más
  `connect-src 'self'` para el modo *pre-clearance*, que ya estaba.
  `connect-src` suma el host por dos motivos: el Service Worker vuelve a
  pedir con `fetch()` los scripts de otro origen (lo mismo que pasó con los
  tiles del mapa) y `api.js` manda desde la página avisos de diagnóstico
  (`sendBeacon`/`fetch` a `/cdn-cgi/challenge-platform/…`; observado, ver
  la nota de abajo). Se lista el
  **host** y no rutas, a diferencia de reCAPTCHA: allí el límite por ruta
  evitaba los endpoints JSONP de `www.google.com`, un host de propósito
  general y un rodeo conocido de la CSP; `challenges.cloudflare.com` está
  dedicado a los desafíos, y Turnstile usa rutas internas no documentadas
  que cambian (`api.js` redirige a `/turnstile/v0/g/<versión>/api.js` y se
  recarga a sí mismo cuando hay versión nueva; el iframe vive bajo
  `/cdn-cgi/challenge-platform/…`). Fijarlas dejaría el registro roto en
  silencio tras una actualización de Cloudflare. `src/app/csp.test.ts` fija
  las tres directivas, que no quede ningún origen de Google y la guarda de
  la variable en Vercel.
- **Qué está documentado y qué se observó.** La guía de Cloudflare
  documenta la URL de `api.js`, el aviso de no cachearlo, los parámetros
  del widget (tamaños, idiomas: con un código no admitido cae al inglés),
  los tokens de un solo uso que vencen a los 300 s y la CSP (`script-src` y
  `frame-src` con el host, `connect-src 'self'` para *pre-clearance*). Lo
  demás se **observó el 28/10** con la build de producción, Chromium y la
  site key de prueba, y leyendo el `api.js` que servía Cloudflare ese día
  (`/turnstile/v0/g/c787ce48cf6b/api.js`): la redirección 302 de `api.js`
  a esa ruta con versión, la recarga de sí mismo (`_upgrade`), el error de
  `turnstile.ready()` con scripts asíncronos, los avisos por
  `sendBeacon`/`fetch` y el iframe bajo `/cdn-cgi/challenge-platform/…`.
  Son detalles internos de Cloudflare que pueden cambiar; por eso la CSP no
  depende de ellos (lista el host) y el hook tampoco (no usa `ready`).
- **Service Worker.** `sw.ts` manda a la red (`NetworkOnly`) todo lo que va
  a `challenges.cloudflare.com` (`esPeticionAlCaptcha` en
  `pwa/cachesDeSesion.ts`), antes de que la regla `cross-origin` de
  `defaultCache` guarde `api.js`: Cloudflare avisa que cachearlo hace fallar
  el widget cuando publican una versión nueva.

### Confirmación del correo (NC-09)

Decisión del usuario (28/10): una cuenta nueva **no puede iniciar sesión**
hasta abrir el enlace que recibe por correo. Contrato:
`project-context/handoffs/2026-10-28-confirmacion-correo.md`; el porqué, en
el README del backend («Confirmación del correo»). Lo que cambia en la PWA:

- **El registro ya no inicia sesión.** `POST /api/auth/registro` responde 201
  con `{email, vigenciaEnlaceHoras}` (tipo `CuentaPorConfirmar`), sin token:
  `api.ts` ya no guarda nada. El formulario se reemplaza por «Revisa tu
  correo» (`RegistroEnviado`) con el correo de la respuesta, la vigencia y
  «Reenviar el enlace»; el foco pasa a ese título porque el formulario que lo
  tenía desaparece. «Ir a iniciar sesión» conserva el `?redirect=`: quien
  llegó desde `/reportar` vuelve ahí al entrar después de confirmar.
- **Dominio del correo rechazado.** Los 409 `CORREO_DESECHABLE` y
  `DOMINIO_SIN_CORREO` van en línea en el campo del correo (no como error
  general) y se borran en cuanto se cambia lo escrito. Como cualquier error
  del registro, reinician el captcha (NC-08): el token ya se gastó.
- **Login.** El 409 `CORREO_NO_CONFIRMADO` muestra el mensaje del backend y
  «Reenviar el enlace» al correo con el que se intentó entrar (no al que
  quede después en el campo). El backend solo responde ese 409 con la
  contraseña correcta, así que no revela qué cuentas existen. El reenvío va
  fuera del `<form>` del login porque tiene el suyo (no se anidan).
- **`/confirmar-cuenta?token=…`** (grupo `(auth)`, pública; la URL la arma el
  backend y `RUTA_CONFIRMAR_CUENTA` la fija). Es una pantalla de acceso más
  (`RUTAS_DE_ACCESO` en `auth/model/rutas.ts`, una sola lista): sin el marco
  de la app y sin el aviso «inicia sesión» de la cola offline, que al volver
  la dejaría sin el token. La página sigue siendo
  estática: el token se lee en el cliente con `useSearchParams` dentro de un
  `Suspense` y nunca llega al HTML del servidor. `useConfirmacionDeCorreo`:
  - toma el token **una vez** y lo saca de la URL con `history.replaceState`
    (Next lo integra con su router) **antes** de llamar al API, para que no
    quede en el historial ni en el `Referer`;
  - llama **una sola vez**, también con el doble efecto de StrictMode: una
    ref marca el pedido y otra si el componente sigue montado. Con el flag
    `cancelado` de siempre, la limpieza del primer montaje descartaría la
    única respuesta. Por eso no usa `useCarga`, que está pensado para
    lecturas que se pueden repetir y descartar;
  - sin token, o con uno de más de 100 caracteres, no llama: el backend
    respondería 400, y para el usuario es lo mismo que
    `CONFIRMACION_INVALIDA`.

  Estados (`model/confirmacion.ts`, decididos por `codigo`, nunca por el
  texto): `confirmando`; `confirmado` (204, y también el 409
  `CORREO_YA_CONFIRMADO`: un segundo clic, o el antivirus del correo que abrió
  el enlace antes); `vencido`, `reemplazado` e `invalido`, con el mensaje del
  backend y el formulario para pedir otro enlace (aquí no se conoce el
  correo, así que se pide); y `error` (red o 5xx), con «Volver a intentar» y
  el mismo token. Ninguno inicia sesión: todos terminan en el login. El
  resultado se anuncia en una región `role="status"` que existe desde el
  primer render.
- **Reenviar** (`ReenviarConfirmacion` + `useReenvioDeConfirmacion`). El
  backend responde 202 siempre (cuenta inexistente, ya confirmada, tope
  alcanzado o enviado), así que tras pedirlo la pantalla dice siempre lo
  mismo: «Si tu cuenta está pendiente de confirmar, te enviamos un enlace
  nuevo…». El botón espera **60 s** después de cada reenvío y, en «Revisa tu
  correo», desde el registro: el backend admite uno por minuto y el del
  registro cuenta; un pedido antes no enviaría nada y la respuesta no lo
  diría. Durante la espera el botón lleva `aria-disabled`, no `disabled`,
  para no perder el foco justo después de usarlo, y su descripción dice
  cuántos segundos faltan; el hook ignora el clic. La espera vive en la
  pantalla (un nuevo intento de login con el mismo error la reinicia): el
  tope real lo pone el backend.
- **«¿Olvidaste tu contraseña?» (NC-09c).** Desde NC-09b el backend no
  envía nada a una cuenta sin confirmar que pide recuperar la contraseña
  (responde lo mismo que para un correo sin cuenta). Quien no confirmó y
  además olvidó la contraseña quedaba atascado: el reenvío del login exige
  la contraseña correcta y registrarse de nuevo da «correo ya registrado».
  Decisión del usuario (28/10, opción C de
  `propuestas/2026-10-28-reenviar-confirmacion-sin-contrasena.md`): tras
  pedir el token, el mensaje genérico suma «Si todavía no confirmaste tu
  cuenta, no te llegará este correo: pide el enlace de confirmación»
  (`AVISO_RECUPERACION_SIN_CONFIRMAR`) y, al lado, `ReenviarConfirmacion`
  con el correo ya escrito. Se muestra **siempre**, haya o no cuenta, así
  que no revela nada; el reenvío conserva su mensaje neutro y la espera de
  60 s. El aviso va dentro de la misma región `role="status"` que el mensaje
  de éxito, para que se anuncie con él, y el reenvío va fuera del `<form>`
  del token (no se anidan). Con «Ya tengo un token» no hay correo y no se
  ofrece. Sin cambio de contrato ni de backend.
- **El Service Worker no guarda esa página.** La regla por defecto de
  Serwist para las páginas del mismo origen (`NetworkFirst`, caché
  `others`) guardaría la respuesta con la URL completa, token incluido, como
  clave en Cache Storage. `sw.ts` la manda a `NetworkOnly`
  (`esPaginaConTokenEnLaUrl` en `pwa/cachesDeSesion.ts`, que repite la ruta
  porque el SW se compila aparte; un test la compara con la de la app). Sin
  red, el enlace no abre la página, pero tampoco podría confirmar nada.
- **Lo que no se evita.** La primera petición a la PWA lleva el token en la
  query y puede quedar en los registros de acceso de Vercel; `replaceState`
  no lo impide. El handoff lo acepta (un solo uso, 24 h, inútil una vez
  confirmada la cuenta); evitarlo exigiría pasar a un fragmento (`#token=`),
  y lo haría primero el backend. Al API no le llega por el `Referer`: la
  política `strict-origin-when-cross-origin` de `next.config.ts` solo manda
  el origen a otro origen, y la página no carga recursos de terceros.
- **CSP y `proxy`:** sin cambios. Los dos endpoints nuevos son del mismo
  origen del API, que ya está en `connect-src`, y la PWA no tiene `proxy`.

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
Componerla es del cliente, y se hace una sola vez en el gateway (FE-07): los
`features/<f>/api.ts` devuelven `fotoUrl` ya absoluta (`conFotoAbsoluta` /
`urlDeFoto()` de `lib/api/client.ts`), y páginas, componentes y `map/` la
usan tal cual, sin importar el cliente HTTP.

- **Foto de reporte** (`/media/fotos/reportes/…`) es **pública**: sirve
  directo en `<img src>`, a través de `components/FotoDeReporte.tsx`
  (QA-1 M-3): si no carga (el archivo ya no está en el servidor, o es una
  URL antigua que pide sesión), en vez del icono de imagen rota aparece un
  recuadro neutro «Foto no disponible». El reemplazo conserva el texto
  alternativo como nombre (`role="img"`, «<alt> (foto no disponible)») y, si
  la foto era decorativa, sigue siéndolo. El popup del mapa hace lo mismo con
  su propio `<img>` (`FotoDelPopup` en `map/MapaReportes.tsx`): `map/` es un
  adaptador y no importa componentes compartidos. Los dos toman el texto y el
  nombre del reemplazo de la misma regla pura, `lib/types/fotoDeReporte.ts`.
- **Foto de perfil** (`/api/perfiles/fotos/…`) exige `Authorization`: un
  `<img src>` plano devuelve **401**; hay que traerla con `apiFetch` y
  convertirla a `blob:`. `fotoRequiereAuth()` distingue ambos casos. Lo
  hace `descargarFotoDePerfil` (`features/auth/api.ts`), y los componentes la
  reciben del hook `useFotoDePerfil`, que libera la URL `blob:` al cambiar o
  desmontar.

**Antes de subir (DEP-11).** Las dos fotos que sube el ciudadano, la del
reporte (`CampoFoto`) y la de perfil (`CampoFotoDePerfil`), pasan al elegirlas
por la misma regla pura, `lib/types/fotoParaSubir.ts` (en `lib/` porque la usan
dos features), en el orden del backend: no vacía (0 bytes es su 409 «La foto
esta vacia»), extensión `jpg`, `jpeg`, `png` o `webp`, más el tipo MIME si el
navegador lo declara, y hasta 10 MB (los 10 × 1024 × 1024 bytes de
`max-file-size`). Antes solo la del reporte se validaba; la de perfil llegaba
al backend y recibía 413, o, por encima de 32 MB, un corte de conexión que la
pantalla mostraba como «Sin conexión con el servidor» (backend/README,
DEP-11). Una foto rechazada no
queda elegida, así que tampoco entra a la cola offline, y el motivo («La foto
supera 10 MB.», «Formato no permitido. Usa JPG, PNG o WEBP.») se asocia al
campo con `aria-describedby`, y con `aria-invalid` si el campo quedó sin
foto. En el reporte, si ya había una foto válida, se conserva y es la que se
enviará: el campo no se marca inválido y el aviso agrega «Se mantiene la foto
anterior.» («Quitar» borra la foto y el aviso). Lo que solo se sabe leyendo los
bytes (que sea de verdad una imagen, los megapíxeles) sigue siendo del
backend: su 409 «Formato de foto no permitido…» y el 503 sin turno de
saneado (DEP-12) llegan como `ApiError` y se muestran con el `message` del
API, sin encolar el reporte.

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

**Marcadores accesibles (QA-1 M-7).** Leaflet hace de cada marcador un
`div role="button" tabindex="0"` (Enter abre su popup), pero sin nombre: un
lector de pantalla anunciaba «botón» decenas de veces. Cada marcador lleva
ahora como `title` (su nombre accesible, y la sugerencia al pasar el ratón)
el título, el estado en palabras y el tipo de daño (`nombreDeMarcador`). Leaflet
lee el `title` solo al crear el marcador, así que el nombre forma parte de la
`key`. El área táctil mide 28 px (el mínimo es 24, WCAG 2.2 2.5.8) con el
punto visible de 20 px centrado. La vista Lista sigue siendo la alternativa
completa al mapa.

Los tiles de OpenStreetMap **sí** están listados en `img-src` de la CSP
(hosts concretos, no `*`); sin eso el mapa se ve en blanco.

**También en `connect-src`.** En producción el Service Worker intercepta las
peticiones a otros orígenes (la regla de otros orígenes de `defaultCache`
de Serwist) y las repite con `fetch()`. Ese `fetch()` se rige por
`connect-src`, no por `img-src`. Mientras los tiles solo estaban en `img-src`,
el mapa cargaba en la primera visita, antes de que el SW controlara la
página, y desde la segunda quedaba sin calles (`net::ERR_FAILED` en cada
tile). Pasaba en cualquier navegador, incluidos el iPhone y Android. En
desarrollo no se nota porque el SW está desactivado.

Verificado el 21/10 con la build de producción detrás de un túnel HTTPS:
- con el SW bloqueado cargaban los 15 tiles;
- con el SW controlando la página y solo `img-src`, cargaban 0 de 6;
- con el SW controlando la página y los tiles en `connect-src`, cargaban 6 de 6 en tres recargas.

**Los tiles se piden con `crossOrigin="anonymous"`.** Al pasar por el SW, los
tiles entran en la caché de otros orígenes de `defaultCache` (`NetworkFirst`,
32 entradas, 1 h). Un `<img>` sin CORS deja una respuesta opaca, y Chrome
cuenta cada respuesta opaca como unos 7 MB de cuota. Esa cuota es la misma de
la cola offline, que guarda fotos en IndexedDB. OpenStreetMap responde con
`Access-Control-Allow-Origin: *`, así que con `crossOrigin` las respuestas
dejan de ser opacas y ocupan lo que pesan.

**Un solo host.** La CSP lista solo `https://tile.openstreetmap.org`, que es
el que usan los tres mapas. Ya no incluye el comodín `*.tile.openstreetmap.org`
de los antiguos subdominios a/b/c.

**Dónde está el daño (QA-1 I-1).** Los tres detalles de reporte (público,
del ciudadano y de la bandeja municipal) muestran la sección «Ubicación»
(`components/UbicacionDelReporte.tsx`, compartida porque la usan `reportes` y
`gestion`) con tres formas del mismo dato: un mini mapa, las coordenadas en
texto (latitud, longitud, 5 decimales ≈ 1 m: se pueden copiar y un lector de
pantalla las lee) y el enlace «Abrir en OpenStreetMap» en otra pestaña.
- El mini mapa (`map/MiniMapaUbicacion.tsx`) es de **solo lectura**: sin
  arrastre, zoom táctil, rueda, doble clic ni teclado de Leaflet, para que al
  desplazar la página con el dedo no se mueva el mapa ni se pierda el punto.
  Tampoco lleva botones +/-: no aportan en un mapa que solo muestra un punto,
  y para verlo en grande está el enlace a OpenStreetMap.
- Los otros dos mapas usan `map/ControlDeZoom.tsx` en vez del control por
  defecto, que nombraba los botones «Zoom in»/«Zoom out» (Leaflet usa ese
  texto como `title` y `aria-label`): ahora dicen «Acercar» y «Alejar».
- El marcador no es interactivo: es una imagen con nombre accesible
  («Ubicación del daño: <título>»). Se arma como elemento del DOM y no como
  HTML en texto, porque lleva el título que escribió el ciudadano.
- El enlace es navegación externa, no un recurso que cargue la página: no
  pasa por la CSP, que no cambia.
- Sin coordenadas válidas dice «Sin ubicación registrada», nunca un punto en
  (0, 0).

**`/mapa` en el móvil (QA-1 I-4, provisional).** Antes, en pantallas
angostas, filtros, capas y leyenda iban encima del mapa y lo dejaban debajo
del pliegue (empezaba en y = 922 px con un viewport de 844). Ahora el mapa
ocupa la primera pantalla: el panel queda plegado en una franja con el conteo
(siempre visible y en `aria-live`) y un botón «Filtros, capas y leyenda»
(`aria-expanded`/`aria-controls`, con el número de filtros aplicados) que lo
despliega encima del mapa, con un alto máximo de ~55 % de la pantalla y su
propio desplazamiento. En escritorio (`md`) no cambia nada. Es una solución
provisional compatible con el rediseño, que pondrá una hoja inferior: solo
cambia el contenedor del panel, no su contenido. Como plegar el panel cambia
el alto del mapa sin cambiar la ventana, `MapaReportes` observa su contenedor
(`ResizeObserver` → `invalidateSize`, que emite `moveend` y pasa por el mismo
debounce y umbral de siempre); sin eso el área nueva quedaba gris.

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

- **US-01** registro (`/registro`) · **US-02** login (`/login`). El login
  termina en `destinoTrasAcceso` (QA-1 I-2): el `?redirect=` si es una ruta
  interna (validado con `destinoInterno`), si no la puerta de entrada del rol
  (el ciudadano, «Mis reportes»), y antes la aceptación de términos si está
  pendiente. Desde NC-09 el registro no inicia sesión: muestra «Revisa tu
  correo» y lleva al login. Los enlaces «Regístrate» e «Inicia sesión», y el
  de «Revisa tu correo», conservan el `?redirect=`: quien llegó al login
  desde `/reportar` y crea una cuenta vuelve a `/reportar` al entrar.
- `/sesion` (verificación de `GET /api/auth/me`, andamiaje del primer slice)
  **se eliminó** en QA-1 I-2: el registro llevaba ahí y el ciudadano caía en
  una pantalla de depuración con el rol y la preferencia en crudo y sin
  navegación. Ya existían las landings por rol que la reemplazaban, nada más
  la enlazaba y el perfil (`/perfil`) muestra esos datos de verdad.
- **US-05** crear reporte (`/reportar`, solo CIUDADANO: la misma
  `GuardiaDeRol` que «Mis reportes», QA-1 M-10; antes bastaba la sesión y un
  funcionario o el admin llenaban el formulario entero para recibir un 403 al
  enviar): GPS con fallback a marcar en el mapa
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
- **US-19** comparar distritos en `/desempeno`: de 2 a 4 distritos (columna
  «Comparar») lado a lado, con tasa, resueltos/total y tiempo promedio, más
  una gráfica de barras de la tasa. El tipo de daño se aplica también a la
  comparación (ver «Comparar distritos» en Decisiones técnicas). Verificado
  el 20/10 con los datos seed (Miraflores 66.7 % frente a San Juan de
  Lurigancho 10.7 %).
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
- **NC-02** título y severidad: obligatorios en `/reportar` (severidad sin
  valor por defecto), editables en PENDIENTE (US-08) y visibles en el mapa, la
  lista, los detalles, mis reportes y la bandeja (solo lectura). La cola
  offline gana el estado «incompleto» para los reportes guardados antes (ver
  «Título y severidad del reporte (NC-02)» en Decisiones técnicas).
  Verificado el 21/10 en Chrome contra el backend real, vía túnel HTTPS:
  crear con título y severidad (201, asignado a Miraflores); un título de 4
  caracteres queda bloqueado con `aria-invalid`/`aria-describedby`; la edición
  en PENDIENTE se guarda (confirmado en la BD); una adhesión muestra el título
  y la severidad del reporte existente, con el aviso; un ítem incompleto
  inyectado en IndexedDB no se envía solo; el aviso «faltan datos» aparece en
  `/mapa`; completar sin severidad muestra «Elige la severidad del daño»; y,
  tras completarlo, se envió con la MISMA `Idempotency-Key` (reporte #185) y
  salió de la cola.
- **NC-09** confirmación del correo: «Revisa tu correo» tras el registro, el
  aviso con reenvío en el login y `/confirmar-cuenta` (ver «Confirmación del
  correo (NC-09)» en Decisiones técnicas). Cubierta por tests de las reglas
  (`model/confirmacion.ts`), de los hooks (una sola llamada con StrictMode,
  token fuera de la URL, cada código, espera de 60 s), del gateway y de las
  tres pantallas. Los tipos salen del OpenAPI del backend de NC-09, y el
  contrato se probó con `curl` contra ese backend (201 del registro, 409
  `CORREO_DESECHABLE`, `CORREO_NO_CONFIRMADO` y `CONFIRMACION_INVALIDA`, 202
  del reenvío). **Todavía no se recorrió en el navegador** con el correo
  real (Mailhog en local, Resend en producción).
- **NC-09c** «Reenviar el enlace» de confirmación desde «¿Olvidaste tu
  contraseña?», tras pedir el token (ver «Confirmación del correo (NC-09)»).
  Cubierta por tests del componente: aviso y acción tras pedir el token,
  reenvío al correo escrito con el mensaje neutro y la espera de 60 s, y sin
  reenvío con «Ya tengo un token».
- **NC-04** sugerencia de la categoría por la foto en `/reportar` (ver
  «Sugerencia de la categoría por la foto (NC-04)» en Decisiones técnicas).
  Cubierta por tests de las reglas (`model/sugerencia.ts`), del hook
  (cancelación, espera agotada, 409 y fallos), del gateway y del formulario.
  **Todavía no se verificó contra el backend real**: falta probarla con el
  clasificador falso del perfil `local` (`CLASIFICACION_FALSO_RESPUESTA` con
  `bache:0.87`, vacío y `falla`).

### 404 e ids inválidos (QA-1 M-11)

- `app/not-found.tsx` es la 404 de toda la app, en castellano, con título
  propio y enlaces a la portada y al mapa. La de Next estaba en inglés y sin
  salida.
- El id de las rutas de detalle (`/reportes/[id]`, `/mis-reportes/[id]`,
  `/bandeja/[id]`) se valida en el cliente **antes** de llamar al API
  (`lib/types/idDeRuta.ts`: solo enteros positivos). `/reportes/abc` pedía
  `/api/reportes/NaN`, que no coincide con la ruta pública del backend: sin
  sesión respondía 401 y el cliente mandaba al login a quien solo abrió un
  enlace roto. Ahora dice «Reporte no disponible» sin preguntar nada. No se
  usa `notFound()`: el detalle ya tiene su propio «no disponible», que es lo
  mismo que se muestra para un id que no existe o un reporte retirado.

### Reportes que apoyas (QA-1 M-6)

Quien se suma a un reporte ajeno (adhesión, US-09) no lo veía en ninguna
parte: `mis-reportes` solo trae lo que el ciudadano creó. El backend agregó
`GET /api/reportes/mis-adhesiones` (handoff del 22/10) y `/mis-reportes` lo
muestra en una **sección aparte, «Reportes que apoyas»**, debajo de los
propios:

- **Solo lectura.** Sin editar, retirar ni calificar: son del creador (el
  backend respondería 403; calificar es solo del creador, US-26). Por eso cada
  fila lleva al **detalle público** `/reportes/[id]` y nunca a
  `/mis-reportes/[id]`, que se arma desde `mis-reportes` y ofrece esas
  acciones (`model/apoyos.ts`, `enlaceDeReporteApoyado`).
- **Un CANCELADO no enlaza**: su detalle público da 404 (lo retiró su creador,
  `tieneVistaPublica`). La fila muestra el chip «Cancelado» y dice «El vecino
  que lo creó lo retiró…» en vez de llevar a «Reporte no disponible».
- **Carga aparte** (`hooks/useReportesQueApoyas`): si falla (p. ej. contra un
  backend anterior a QA-1, sin la ruta), la lista propia se ve igual y solo la
  sección muestra el error con «Reintentar». Se recarga cuando cambia la cola
  offline: un reporte «Pendiente de envío» puede resultar, al enviarse, una
  adhesión, y entonces aparece aquí y no entre los propios.
- **Misma fila que los propios** (`components/ResumenDeReporteEnFila`): foto,
  título, `ChipEstado`, tipo, severidad, distrito, fecha y vecinos. Estado
  vacío con `EstadoVacio` que explica cómo se llega a apoyar un reporte.
- **Tras una adhesión**, la confirmación de `/reportar` ofrece «Ver los
  reportes que apoyas» (`/mis-reportes#reportes-que-apoyas`) en vez de «Ver
  mis reportes». Next no puede desplazarse al ancla por su cuenta: el título
  de la sección aparece recién cuando `GuardiaDeRol` resuelve la sesión, y la
  lista de arriba lo desplaza hacia abajo al cargar. Por eso la sección lleva
  el foco a su título (y con él la vista) cuando ella y la lista de arriba ya
  cargaron.
- **Los avisos no cambian**: push y correo siguen yendo solo al creador, y la
  sección lo dice. Avisar también a quien apoya sería una decisión aparte.

Verificado el 22/10 en Chrome (modo visible) contra el backend de `develop`:
un ciudadano de prueba reportó con GPS un bache a metros de uno ajeno, la
confirmación dijo «Ya existía un reporte de este daño» y «Ver los reportes que
apoyas» llevó a la sección con el foco en su título y el reporte primero,
enlazado a `/reportes/185`; un reporte apoyado que su creador retiró se ve
«Cancelado», sin enlace y con la explicación. En la bandeja, un reporte sin
responsable pidió `/responsable` (204) y mostró «Sin responsable asignado».

### Responsable sin asignar: 204 (QA-1 M-4)

`GET /api/reportes/{id}/responsable` responde **204 sin cuerpo** cuando el
reporte no tiene responsable (antes, 404). `apiFetch` devuelve `undefined` en
un 204 y `gestion/api.ts` (`responsableActivo`) lo normaliza a `null`, que es
lo que `useResponsable` muestra como «sin responsable». El `catch` que
traduce el 404 a `null` **se mantiene durante la transición** (la PWA nueva
contra un backend anterior a QA-1); con el backend nuevo un 404 significa que
el reporte no existe, y cuando ambos estén desplegados ese `catch` se puede
quitar. Lo cubre `gestion/api.test.ts` sobre el cliente real con `fetch`
falso (200, 204, 404 y 403).

### `null` no es cero

Las métricas de desempeño llegan en `null` cuando no hay datos: un distrito
sin reportes **no tiene una tasa del 0 %, no tiene tasa**. La interfaz
distingue ambos casos ("Sin datos" vs "0 %") porque confundirlos acusaría de
mal desempeño a una municipalidad que simplemente no recibió reportes. Por la
misma razón, al ordenar, los `null` van siempre al final aunque se invierta la
dirección — igual que el `NULLS LAST` del backend.

El caso contrario también se cuida (QA-1 M-12): un tiempo promedio de
menos de una hora se muestra «< 1 h», no «0 h». San Miguel promedió 0,01 h
y, redondeado, parecía cero o falta de dato cuando era la atención más
rápida. En el móvil la tabla del ranking (46rem) no cabe: va en una región
con foco (se desplaza también con el teclado) y una indicación visible solo
en pantallas angostas dice que se desliza hacia los lados. Esa indicación no
es la descripción accesible de la región (`aria-describedby`): el lector la
anunciaría también en escritorio, donde está oculta y la tabla cabe.

La barra de progreso usa **un solo color**, no una escala rojo-ámbar-verde:
colorear por umbrales obligaría a inventar qué tasa cuenta como "mala", un
juicio que ni el backlog ni el backend definen. El ranking y el número ya
comunican la comparación sin que la interfaz emita su propia calificación.

### Comparar distritos (US-19)

- **El estado vive en la URL** (`?comparar=21,41&categoria=3`), no en estado
  local: compartir la dirección comparte la comparación y el filtro. Se
  escribe con `router.replace`, no `push`, para no llenar el historial con
  cada casilla. `useSearchParams` obliga a envolver el índice en `Suspense`
  (sin eso falla `next build`). El orden de la tabla sí es local: es de quien
  mira. Una URL editada a mano se depura contra los catálogos: un distrito o
  un tipo de daño inexistente no se usa.
- **Gráfica en CSS, sin librería**, como la barra del ranking: con 2 a 4
  barras de una sola magnitud basta, y se adapta sola al teléfono. Un solo
  color, por la misma razón de arriba. Para lectores de pantalla es una
  imagen (`role="img"`) con el resumen en texto, y la tabla de la
  comparación (una columna por distrito) es su equivalente completo.
- **El máximo de 4 no deshabilita las casillas:** al intentar marcar una
  quinta, no se agrega y un aviso en una región `role="status"` explica por
  qué. Una casilla deshabilitada no dice por qué lo está.
- **`null` no es cero, también aquí:** con un tipo de daño elegido, el
  backend solo devuelve los distritos con reportes de ese tipo; un distrito
  comparado sin fila muestra «Sin datos» en todas sus cifras, nunca 0 % ni
  «0 / 0».

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
- **Filtros y vista en la URL (QA-1 M-9).**
  `/mapa?distrito=21&categoria=1&estado=RESUELTO&desde=…&hasta=…&vista=lista`
  (`model/estadoDelMapa.ts`, `hooks/useEstadoDelMapaEnUrl.ts`). Antes eran
  estado local: al volver del detalle (Atrás o «← Volver al mapa») la
  pantalla reaparecía en «Todos» y en la vista Mapa, y no había forma de
  compartir una vista filtrada. Decisiones:
  - Se escribe con `window.history.replaceState`, que Next integra con su
    router (`useSearchParams` se actualiza) **sin navegar**: cambiar un filtro
    no pide nada al servidor ni vuelve a montar el mapa. `replace` y no
    `push`, como en `/desempeno`.
  - Una URL editada a mano no rompe: un id que no es entero positivo, un
    estado que el mapa no muestra (incluido `CANCELADO`) o una fecha imposible
    cuentan como «sin filtro», y un distrito o tipo que el catálogo no conoce
    se descarta en cuanto el catálogo carga.
  - Los filtros conservan su identidad mientras la URL no cambia (se
    memorizan por el texto de la query): `useBusquedaMapa` depende de ella
    para el debounce.
  - La lista y el popup abren el detalle con `?volver=<vista del mapa>`, y
    «← Volver al mapa» regresa ahí. El parámetro se valida con el mismo
    filtro de redirección abierta del login (`destinoInterno`) y además debe
    ser `/mapa`: no puede llevar a otra pantalla ni a otro sitio.
  - No se guardan el centro ni el zoom: cambian con cada gesto y no son un
    filtro; tampoco las capas (marcadores y calor), que son de quien mira.

**Sincronización offline (US-06, implementada después):** sin conexión, el
reporte queda en la cola de IndexedDB con su clave de idempotencia y se envía
solo al volver la señal (ver "Cola offline" en Decisiones técnicas).

Siguiente slice: **US-10** (mapa interactivo), que reutiliza el componente de
mapa en modo lectura sobre `GET /api/reportes` con bounding box.

import type { NextConfig } from 'next';

const esDesarrollo = process.env.NODE_ENV === 'development';

/**
 * URL del API tal como llega del entorno, sin espacios. Vacia cuenta como
 * ausente, igual que en `src/lib/api/client.ts`: los dos usan el mismo valor.
 */
const apiBaseUrlDelEntorno = process.env.NEXT_PUBLIC_API_BASE_URL?.trim() || undefined;

/*
 * En un despliegue de Vercel (Production o Preview) la URL del API es
 * obligatoria y HTTPS. Se hornea en el bundle y en la CSP: sin ella el build
 * caeria en `localhost:8080` y la PWA desplegada quedaria rota sin ningun
 * aviso, y una pagina HTTPS no puede llamar a un `http://` (contenido mixto).
 *
 * Se mira `VERCEL_ENV` y no `VERCEL`: `vercel env pull` deja `VERCEL=1` y
 * `VERCEL_ENV=development` en `.env.local`, y con `VERCEL` la guarda romperia
 * el desarrollo local. En local y en la CI no aplica: alli vale el respaldo
 * de abajo (DEP-06).
 */
const esDespliegueDeVercel = process.env.VERCEL_ENV === 'production' || process.env.VERCEL_ENV === 'preview';

/**
 * Site key publica de Cloudflare Turnstile (NC-08b), sin espacios; vacia
 * cuenta como ausente, igual que en `src/features/auth/model/captcha.ts`.
 */
const turnstileSiteKeyDelEntorno = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim() || undefined;

if (esDespliegueDeVercel) {
  const comoDefinirla =
    'Defínela en Vercel (Project Settings > Environment Variables, para Production y Preview) con el ' +
    'origen HTTPS del API, sin barra final, y vuelve a desplegar. Ver frontend/.env.example.';
  if (!apiBaseUrlDelEntorno) {
    throw new Error(`Falta NEXT_PUBLIC_API_BASE_URL. ${comoDefinirla}`);
  }
  if (!apiBaseUrlDelEntorno.startsWith('https://')) {
    throw new Error(`NEXT_PUBLIC_API_BASE_URL debe empezar por https:// (vale «${apiBaseUrlDelEntorno}»). ${comoDefinirla}`);
  }
  // NC-08: sin site key el registro no muestra el captcha ni envia token, y
  // el backend desplegado (con captcha activo) rechazaria todo registro con
  // 409. Se corta el build en vez de publicar un registro que nunca funciona.
  if (!turnstileSiteKeyDelEntorno) {
    throw new Error(
      'Falta NEXT_PUBLIC_TURNSTILE_SITE_KEY. Defínela en Vercel (Project Settings > Environment Variables, ' +
        'para Production y Preview) con la site key pública del widget de Cloudflare Turnstile, y vuelve a ' +
        'desplegar. Ver frontend/.env.example.',
    );
  }
}

const apiBaseUrl = apiBaseUrlDelEntorno ?? 'http://localhost:8080';

/** Servidores de tiles del mapa (Leaflet + OpenStreetMap). */
const TILE_HOSTS = 'https://tile.openstreetmap.org';

/**
 * Cloudflare Turnstile, la verificacion del registro (NC-08b; reemplazo a
 * reCAPTCHA v2). Se lista el HOST, como pide la referencia de CSP de
 * Turnstile, y no rutas como se hizo con Google:
 *
 * - Con Google el limite por ruta tenia un motivo concreto: `www.google.com`
 *   sirve de todo, incluidos endpoints JSONP que devuelven script con un
 *   callback elegido por quien llama (un rodeo conocido de la CSP).
 *   `challenges.cloudflare.com` es un host dedicado a los desafios de
 *   Cloudflare.
 * - Turnstile usa rutas internas que no documenta y puede cambiar. Lo
 *   observado el 28/10 (build de produccion con la site key de prueba y el
 *   `api.js` servido ese dia): `api.js` redirige a
 *   `/turnstile/v0/g/<version>/api.js` y se recarga a si mismo cuando hay
 *   version nueva; el iframe y los avisos de diagnostico que manda la pagina
 *   (`sendBeacon`/`fetch`) van a `/cdn-cgi/challenge-platform/…`. Fijar esas
 *   rutas dejaria el registro roto en silencio tras una actualizacion de
 *   Cloudflare.
 *
 * Repite `ORIGEN_DEL_CAPTCHA` de `src/features/auth/model/captcha.ts`
 * (este archivo se evalua fuera del bundle); `src/app/csp.test.ts` los
 * compara.
 */
const TURNSTILE = 'https://challenges.cloudflare.com';

/**
 * Content-Security-Policy.
 *
 * Es la mitigacion principal del riesgo asumido al guardar el JWT en
 * `localStorage` (ver `src/lib/auth/token-storage.ts`): ataca la causa —que
 * exista XSS— en vez de solo la consecuencia. Protege igual a cualquier
 * modelo de almacenamiento del token.
 *
 * `connect-src` incluye el origen del API porque el backend se despliega
 * aparte; sin eso la propia CSP bloquearia las llamadas. `img-src` tambien,
 * por las fotos publicas de reporte que sirve el backend.
 *
 * Web Push (US-21) no necesita ningun origen nuevo: `pushManager.subscribe`
 * y la entrega de avisos los hace el propio navegador con su servicio de
 * push (FCM, Mozilla, WNS, Apple), fuera de la CSP de la pagina; el Service
 * Worker solo muestra la notificacion y abre rutas de este origen; y la
 * clave VAPID y el registro de la suscripcion van al API, ya listado.
 *
 * Cloudflare Turnstile (NC-08b, solo en el registro) necesita su host
 * (ver `TURNSTILE`) en tres directivas: `script-src` para `api.js`,
 * `frame-src` para el iframe del widget (sin la directiva rige
 * `default-src 'self'` y el widget queda en blanco) y `connect-src`, por el
 * Service Worker (ver el comentario de `connect-src`) y por los avisos de
 * diagnostico que `api.js` manda desde la pagina. Lo que pasa dentro del
 * iframe se rige por la CSP de Cloudflare, no por esta. El `connect-src
 * 'self'` que la referencia pide para el modo *pre-clearance* ya esta.
 */
const csp = [
  "default-src 'self'",
  // 'unsafe-inline' es necesario para el script de arranque de hidratacion de
  // Next; 'unsafe-eval' solo en desarrollo, que es lo que usa el HMR.
  `script-src 'self' 'unsafe-inline'${esDesarrollo ? " 'unsafe-eval'" : ''} ${TURNSTILE}`,
  "style-src 'self' 'unsafe-inline'",
  // blob:/data: para la vista previa de la foto del reporte (US-05).
  // Los tiles de OpenStreetMap son imagenes de otro origen: sin listarlas
  // aqui, el mapa (US-05 ubicacion manual, US-10) se ve en blanco. Se
  // enumeran los hosts concretos en vez de abrir `img-src *`.
  // El origen del API, porque la foto de un reporte es un estatico publico
  // del backend (`/media/fotos/reportes/…`) que va directo en `<img src>`.
  `img-src 'self' data: blob: ${apiBaseUrl} ${TILE_HOSTS}`,
  "font-src 'self' data:",
  // Los tiles tambien van aqui: en produccion el Service Worker intercepta las
  // peticiones de otro origen (`defaultCache` de Serwist) y las repite con
  // `fetch()`, que se rige por `connect-src` y no por `img-src`. Sin listarlos,
  // en cuanto el SW controla la pagina el mapa queda sin calles en cualquier
  // navegador (en desarrollo no pasa porque el SW esta desactivado).
  // Por lo mismo va Turnstile (NC-08b): el SW repite con `fetch()` el
  // `<script>` de `api.js` (sin guardarlo: regla `NetworkOnly` de `sw.ts`,
  // porque Cloudflare avisa que cachearlo rompe el widget); sin listarlo,
  // con el SW activo el widget del registro no aparece.
  `connect-src 'self' ${apiBaseUrl} ${TILE_HOSTS} ${TURNSTILE}${esDesarrollo ? ' ws: wss:' : ''}`,
  // Iframe del widget «No soy un robot» (NC-08b).
  `frame-src ${TURNSTILE}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

const nextConfig: NextConfig = {
  // Turbopack es el bundler por defecto desde Next 16. Fijar la raiz evita
  // que infiera una de mas arriba (hay un package-lock.json en el home del
  // usuario) y advierta en cada build.
  turbopack: {
    root: import.meta.dirname,
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: csp },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
        ],
      },
    ];
  },
};

export default nextConfig;

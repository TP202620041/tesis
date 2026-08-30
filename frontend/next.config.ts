import type { NextConfig } from 'next';

const esDesarrollo = process.env.NODE_ENV === 'development';
const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:8080';

/** Servidores de tiles del mapa (Leaflet + OpenStreetMap). */
const TILE_HOSTS = 'https://tile.openstreetmap.org https://*.tile.openstreetmap.org';

/**
 * Content-Security-Policy.
 *
 * Es la mitigacion principal del riesgo asumido al guardar el JWT en
 * `localStorage` (ver `src/lib/auth/token-storage.ts`): ataca la causa —que
 * exista XSS— en vez de solo la consecuencia. Protege igual a cualquier
 * modelo de almacenamiento del token.
 *
 * `connect-src` incluye el origen del API porque el backend se despliega
 * aparte; sin eso la propia CSP bloquearia las llamadas.
 */
const csp = [
  "default-src 'self'",
  // 'unsafe-inline' es necesario para el script de arranque de hidratacion de
  // Next; 'unsafe-eval' solo en desarrollo, que es lo que usa el HMR.
  `script-src 'self' 'unsafe-inline'${esDesarrollo ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  // blob:/data: para la vista previa de la foto del reporte (US-05).
  // Los tiles de OpenStreetMap son imagenes de otro origen: sin listarlas
  // aqui, el mapa (US-05 ubicacion manual, US-10) se ve en blanco. Se
  // enumeran los hosts concretos en vez de abrir `img-src *`.
  `img-src 'self' data: blob: ${TILE_HOSTS}`,
  "font-src 'self' data:",
  `connect-src 'self' ${apiBaseUrl}${esDesarrollo ? ' ws: wss:' : ''}`,
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

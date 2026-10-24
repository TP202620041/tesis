import type { Metadata, Viewport } from 'next';
import { Public_Sans } from 'next/font/google';
import { MarcoDeLaApp } from '@/features/auth/components/MarcoDeLaApp';
import { ProveedorPwa } from '@/pwa/ProveedorPwa';
import { SincronizadorDeReportes } from './SincronizadorDeReportes';
import { PLANTILLA_TITULO } from './titulo';
import './globals.css';

/*
 * Public Sans (OFL; la tipografía de USWDS, derivada de Libre Franklin), la
 * de la dirección «Cívica» (DIS-1). `next/font/google` la descarga en el
 * build y la sirve desde el propio origen: el navegador no llama a Google y a
 * la CSP le basta `font-src 'self'`. Es variable, así que un solo archivo
 * cubre todos los pesos. `--font-sans` (globals.css) la toma de esta variable.
 */
const publicSans = Public_Sans({
  variable: '--font-public-sans',
  subsets: ['latin'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: 'Ciudad Viva — Reporte ciudadano de daños viales',
    template: PLANTILLA_TITULO,
  },
  description:
    'Plataforma de crowdsourcing geoespacial para el reporte ciudadano y la gestión ' +
    'municipal de infraestructura vial en Lima Metropolitana.',
  applicationName: 'Ciudad Viva',
  manifest: '/manifest.webmanifest',
  // PWA instalada en iPhone: la página sigue por debajo de la hora y la
  // batería, que iOS pinta siempre en blanco. Por eso la barra superior del
  // móvil es tinta translúcida (`.cv-translucida`) y las pantallas sin
  // cabecera llevan una franja en su lugar (`MarcoDeLaApp`).
  appleWebApp: { capable: true, title: 'Ciudad Viva', statusBarStyle: 'black-translucent' },
};

export const viewport: Viewport = {
  // La página ocupa toda la pantalla (también bajo la isla y la barra de
  // inicio); el marco reserva `env(safe-area-inset-*)` donde hace falta.
  viewportFit: 'cover',
  // La barra del navegador en tinta; con el sistema en oscuro, el fondo oscuro.
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#1F3350' },
    { media: '(prefers-color-scheme: dark)', color: '#0F141A' },
  ],
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    // `suppressHydrationWarning`: `tema.js` pone `data-theme` en <html> antes
    // de que React hidrate, y el HTML del servidor no lo trae (no puede saber
    // la preferencia del dispositivo). React acepta el atributo del DOM.
    <html lang="es-PE" className={`${publicSans.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        {/* US-23: fija el tema antes del primer pintado (ver public/tema.js).
            Síncrono A PROPÓSITO: un `next/script` `beforeInteractive` se
            descarga antes pero no bloquea, y la página se pintaría un cuadro
            en claro antes de pasar a oscuro. Es un archivo de ~1 KB del mismo
            origen (`script-src 'self'` ya lo permite, sin `'unsafe-inline'`
            nuevo) que el Service Worker deja en caché. */}
        {/* eslint-disable-next-line @next/next/no-sync-scripts -- ver el comentario de arriba */}
        <script src="/tema.js" />
      </head>
      <body className="flex min-h-full flex-col bg-fondo text-texto">
        <ProveedorPwa>
          {/* DIS-1: cabecera, navegación por rol y menú de cuenta comunes. Los
              avisos de la cola van dentro para ubicarse sobre la barra inferior. */}
          <MarcoDeLaApp>
            {children}
            <SincronizadorDeReportes />
          </MarcoDeLaApp>
        </ProveedorPwa>
      </body>
    </html>
  );
}

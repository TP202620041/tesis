import type { MetadataRoute } from 'next';

/**
 * Web App Manifest, via la convencion nativa de App Router.
 *
 * Es lo que permite instalar Ciudad Viva como PWA en el telefono, requisito de
 * base del proyecto: el ciudadano reporta desde la calle, sin instalar una
 * app de tienda (US-01) y con soporte offline (US-06).
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Ciudad Viva — Reporte ciudadano de daños viales',
    short_name: 'Ciudad Viva',
    description:
      'Reporta baches, veredas dañadas y semáforos averiados en Lima Metropolitana, ' +
      'y consulta el desempeño de tu municipalidad distrital.',
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#0369a1',
    lang: 'es-PE',
    orientation: 'portrait',
    icons: [
      {
        src: '/icons/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: '/icons/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
    ],
  };
}

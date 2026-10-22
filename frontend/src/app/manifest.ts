import type { MetadataRoute } from 'next';

/**
 * Web App Manifest, via la convencion nativa de App Router.
 *
 * Es lo que permite instalar Ciudad Viva como PWA en el telefono, requisito de
 * base del proyecto: el ciudadano reporta desde la calle, sin instalar una
 * app de tienda (US-01) y con soporte offline (US-06).
 *
 * Iconos de la identidad «Cívica» (DIS-1; estructura de DEP-06): los
 * `any` y los `maskable` van en entradas separadas. Un mismo PNG no sirve para
 * ambos: el `maskable` necesita fondo a sangre y el dibujo dentro de la zona
 * segura (Android lo recorta en circulo o gota), y usado como `any` se veria
 * con un margen excesivo. Las fuentes SVG estan en `public/icons/`.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    // `id` fija la identidad de la app instalada aunque cambie `start_url`.
    id: '/',
    name: 'Ciudad Viva — Reporte ciudadano de daños viales',
    short_name: 'Ciudad Viva',
    description:
      'Reporta baches, veredas dañadas y semáforos averiados en Lima Metropolitana, ' +
      'y consulta el desempeño de tu municipalidad distrital.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    // Tinta de la marca y el fondo claro de la app (DIS-1): la pantalla de
    // arranque toma el fondo; la barra del sistema, la tinta.
    background_color: '#F5F6F8',
    theme_color: '#1F3350',
    lang: 'es-PE',
    dir: 'ltr',
    // Sin `orientation` a proposito: fijar `portrait` bloquea la rotacion de
    // la PWA instalada e incumple WCAG 2.1, criterio 1.3.4 (README, DEP-06).
    icons: [
      {
        src: '/icons/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/icon-maskable-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: '/icons/icon-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}

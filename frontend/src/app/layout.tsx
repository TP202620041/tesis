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
};

export const viewport: Viewport = {
  // La barra del navegador en tinta; con el sistema en oscuro, el fondo oscuro.
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#1F3350' },
    { media: '(prefers-color-scheme: dark)', color: '#0F141A' },
  ],
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="es-PE" className={`${publicSans.variable} h-full antialiased`}>
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

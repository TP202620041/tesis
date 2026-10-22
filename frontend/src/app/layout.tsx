import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { ProveedorPwa } from '@/pwa/ProveedorPwa';
import { SincronizadorDeReportes } from './SincronizadorDeReportes';
import { PLANTILLA_TITULO } from './titulo';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
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
  themeColor: '#0369a1',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html
      lang="es-PE"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-fondo text-texto">
        <ProveedorPwa>
          {children}
          <SincronizadorDeReportes />
        </ProveedorPwa>
      </body>
    </html>
  );
}

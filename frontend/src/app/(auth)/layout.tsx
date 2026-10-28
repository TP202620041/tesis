import type { ReactNode } from 'react';
import Link from 'next/link';
import { Logo } from '@/components/ui/Logo';

/**
 * Marco comun de las pantallas de acceso (login, registro, recuperacion y
 * confirmacion del correo, NC-09).
 * Sin la navegacion de la app (DIS-1): quien entra aqui viene a una sola
 * cosa, y el logo lleva a la portada.
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    // Los márgenes suman las zonas seguras: con `viewport-fit=cover` (layout
    // raíz) la página llega bajo la hora y la barra de inicio del iPhone.
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-6 px-4 pt-[calc(2.5rem+env(safe-area-inset-top))] pb-[calc(2.5rem+env(safe-area-inset-bottom))]">
      <header className="flex flex-col items-center gap-2 text-center">
        <Link href="/" className="inline-flex min-h-objetivo items-center rounded-control px-2">
          <Logo conNombre tamano={36} />
        </Link>
        <p className="text-sm text-texto-2">Reporte ciudadano de daños viales en Lima Metropolitana</p>
      </header>
      <div className="rounded-tarjeta border border-linea bg-superficie p-6 shadow-tarjeta">{children}</div>
    </main>
  );
}

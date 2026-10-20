import type { ReactNode } from 'react';
import Link from 'next/link';

/** Marco comun de las pantallas de acceso (login, registro, recuperacion). */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-6 px-4 py-10">
      <header className="text-center">
        <Link href="/" className="text-2xl font-bold text-sky-700 dark:text-sky-400">
          Ciudad Viva
        </Link>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Reporte ciudadano de daños viales en Lima Metropolitana
        </p>
      </header>
      {children}
    </main>
  );
}

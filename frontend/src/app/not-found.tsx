import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Página no encontrada',
};

/**
 * QA-1 M-11: 404 de toda la app (rutas inexistentes y `notFound()`), en
 * castellano y con salida. La de Next decia «This page could not be found.»
 * sin ningun enlace de regreso.
 */
export default function NoEncontrada() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col justify-center gap-4 px-4 py-10">
      <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Error 404</p>
      <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Página no encontrada</h1>
      <p className="text-slate-600 dark:text-slate-400">
        La dirección que abriste no existe o cambió. Revisa que esté bien escrita o sigue desde la
        portada.
      </p>
      <nav aria-label="Salidas" className="flex flex-wrap gap-3">
        <Link
          href="/"
          className="rounded-md bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700"
        >
          Ir a la portada
        </Link>
        <Link
          href="/mapa"
          className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700
                     dark:border-slate-600 dark:text-slate-200"
        >
          Ver el mapa de reportes
        </Link>
      </nav>
    </main>
  );
}

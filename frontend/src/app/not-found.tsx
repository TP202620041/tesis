import Link from 'next/link';
import type { Metadata } from 'next';
import { clasesDeBoton } from '@/components/ui/Boton';

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
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center gap-4 px-4 py-10">
      <p className="text-sm font-medium text-texto-2">Error 404</p>
      <h1 className="text-2xl font-bold text-texto">Página no encontrada</h1>
      <p className="text-texto-2">
        La dirección que abriste no existe o cambió. Revisa que esté bien escrita o sigue desde la
        portada.
      </p>
      <nav aria-label="Salidas" className="flex flex-wrap gap-3">
        <Link
          href="/"
          className={clasesDeBoton('primario')}
        >
          Ir a la portada
        </Link>
        <Link
          href="/mapa"
          className={clasesDeBoton('secundario')}
        >
          Ver el mapa de reportes
        </Link>
      </nav>
    </main>
  );
}

'use client';

import { useCerrarSesion } from '../hooks/useCerrarSesion';

/** US-04: botón de cerrar sesión, el mismo en todas las vistas con sesión. */
export function BotonCerrarSesion({ className = '' }: { className?: string }) {
  const cerrar = useCerrarSesion();
  return (
    <button
      type="button"
      onClick={cerrar}
      className={`rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 transition
                  hover:bg-slate-100 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700 ${className}`}
    >
      Cerrar sesión
    </button>
  );
}

'use client';

import Link from 'next/link';
import { useEffect } from 'react';

/** Rutas donde no tiene sentido pedir que inicie sesion: ya esta en eso. */
const RUTAS_DE_ACCESO = ['/login', '/registro', '/recuperar-password'];

function plural(n: number): string {
  return n === 1 ? '1 reporte pendiente' : `${n} reportes pendientes`;
}

/**
 * US-06: aviso NO modal cuando hay reportes en cola y no hay sesion valida
 * (nunca la hubo, se cerro o vencio). No interrumpe: solo ofrece el enlace
 * al login, que vuelve a esta misma pantalla.
 */
export function AvisoPendientesSinSesion({ cantidad, ruta }: { cantidad: number; ruta: string }) {
  if (cantidad === 0 || RUTAS_DE_ACCESO.some((r) => ruta.startsWith(r))) return null;
  return (
    <p
      role="status"
      className="fixed inset-x-4 bottom-4 z-[1100] mx-auto max-w-lg rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 shadow-lg dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100"
    >
      Tienes {plural(cantidad)} de envío:{' '}
      <Link
        href={`/login?redirect=${encodeURIComponent(ruta)}`}
        className="font-medium text-sky-700 underline dark:text-sky-400"
      >
        inicia sesión para enviarlos
      </Link>
      .
    </p>
  );
}

/**
 * US-06, dispositivo compartido: pregunta al cerrar sesion que hacer con los
 * reportes propios que siguen en el dispositivo. Escape equivale a
 * "Conservar", la opcion por defecto (no se pierde nada).
 */
export function DialogoCierreConPendientes({
  cantidad,
  onConservar,
  onDescartar,
}: {
  cantidad: number;
  onConservar: () => void;
  onDescartar: () => void;
}) {
  useEffect(() => {
    const alPulsar = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape') onConservar();
    };
    document.addEventListener('keydown', alPulsar);
    return () => document.removeEventListener('keydown', alPulsar);
  }, [onConservar]);

  return (
    <div className="fixed inset-0 z-[1200] flex items-center justify-center bg-slate-900/50 p-4">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="cierre-pendientes-titulo"
        className="flex w-full max-w-md flex-col gap-4 rounded-lg bg-white p-6 shadow-xl dark:bg-slate-800"
      >
        <h2 id="cierre-pendientes-titulo" className="text-lg font-semibold text-slate-900 dark:text-slate-100">
          {cantidad === 1
            ? 'Tienes 1 reporte sin enviar en este dispositivo.'
            : `Tienes ${cantidad} reportes sin enviar en este dispositivo.`}
        </h2>
        <p className="text-sm text-slate-700 dark:text-slate-300">
          Se enviarán cuando vuelvas a entrar. Si este dispositivo no es tuyo, puedes descartarlos.
        </p>
        <div className="flex flex-wrap justify-end gap-3">
          <button
            type="button"
            onClick={onDescartar}
            className="rounded-md border border-red-300 px-4 py-2 text-sm font-medium text-red-700 dark:border-red-700 dark:text-red-300"
          >
            Descartarlos
          </button>
          <button
            type="button"
            onClick={onConservar}
            className="rounded-md bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700"
          >
            Conservar
          </button>
        </div>
      </div>
    </div>
  );
}

'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { X } from 'lucide-react';
import { BotonIcono } from '@/components/ui/Icono';
import { useCierreDelAvisoDeIncompletos } from '../hooks/useCierreDelAvisoDeIncompletos';

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
      className="fixed inset-x-4 bottom-[calc(var(--cv-alto-nav,0px)+1rem)] z-[1100] mx-auto max-w-lg rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 shadow-lg dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100"
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

/** Donde se completan los reportes incompletos (lista «Pendiente de envío»). */
export const RUTA_PENDIENTES_DE_ENVIO = '/mis-reportes#pendientes-de-envio';

/**
 * NC-02: aviso NO modal, con sesion, cuando hay reportes propios en cola que
 * estan incompletos (guardados por la version anterior, sin titulo o sin
 * severidad): no se envian solos, asi que se invita a completarlos. No se
 * muestra en «Mis reportes», donde ya esta la lista para completarlos.
 *
 * Se puede cerrar por el resto de la sesion de la pestaña (vuelve si
 * aparecen mas incompletos), y va 3rem por encima de la barra inferior del
 * movil (`--cv-alto-nav`, DIS-1; en escritorio, del borde), no pegado a
 * ella: en `/mapa` en un movil, pegado abajo tapaba la atribucion de
 * OpenStreetMap (obligatoria por su licencia).
 */
export function AvisoReportesIncompletos({
  cantidad,
  ruta,
  usuarioId,
}: {
  cantidad: number;
  ruta: string;
  usuarioId: number;
}) {
  const { visible, cerrar } = useCierreDelAvisoDeIncompletos(cantidad, usuarioId);
  if (!visible || ruta === '/mis-reportes') return null;
  return (
    <div
      role="status"
      className="fixed inset-x-4 bottom-[calc(var(--cv-alto-nav,0px)+3rem)] z-[1100] mx-auto flex max-w-lg items-start gap-3 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 shadow-lg dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100"
    >
      <p className="flex-1">
        {cantidad === 1
          ? 'Tienes 1 reporte sin enviar al que le faltan datos: '
          : `Tienes ${cantidad} reportes sin enviar a los que les faltan datos: `}
        <Link
          href={RUTA_PENDIENTES_DE_ENVIO}
          className="font-medium text-sky-700 underline dark:text-sky-400"
        >
          complétalos en Mis reportes
        </Link>
        .
      </p>
      <BotonIcono icono={X} etiqueta="Cerrar aviso" onClick={cerrar} className="-my-2.5 -mr-3" />
    </div>
  );
}

/** Lo que dice el dialogo de cierre segun cuantos se enviaran solos y cuantos no. */
export function textoDelCierre(seEnviaran: number, requierenAccion: number): string {
  const partes: string[] = [];
  if (seEnviaran > 0) {
    partes.push(
      seEnviaran === 1
        ? '1 se enviará cuando vuelvas a entrar.'
        : `${seEnviaran} se enviarán cuando vuelvas a entrar.`,
    );
  }
  if (requierenAccion > 0) {
    partes.push(
      requierenAccion === 1
        ? '1 no se enviará solo: necesita que lo completes, lo revises o lo descartes en Mis reportes.'
        : `${requierenAccion} no se enviarán solos: necesitan que los completes, los revises o los descartes en Mis reportes.`,
    );
  }
  partes.push('Si este dispositivo no es tuyo, puedes descartarlos.');
  return partes.join(' ');
}

/**
 * US-06, dispositivo compartido: pregunta al cerrar sesion que hacer con los
 * reportes propios que siguen en el dispositivo. Escape equivale a
 * "Conservar", la opcion por defecto (no se pierde nada).
 *
 * NC-02: separa los que se enviaran solos de los que necesitan accion
 * (incompletos, rechazados, caducados): de estos no se dice «se enviarán».
 */
export function DialogoCierreConPendientes({
  cantidad,
  seEnviaran = cantidad,
  requierenAccion = 0,
  onConservar,
  onDescartar,
}: {
  cantidad: number;
  seEnviaran?: number;
  requierenAccion?: number;
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
          {textoDelCierre(seEnviaran, requierenAccion)}
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

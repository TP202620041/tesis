'use client';

import Link from 'next/link';
import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { BotonIcono } from '@/components/ui/Icono';
import { RUTAS_DE_ACCESO } from '@/features/auth/model/rutas';
import { useCierreDelAvisoDeIncompletos } from '../hooks/useCierreDelAvisoDeIncompletos';
import { clasesDeBoton } from '@/components/ui/Boton';

function plural(n: number): string {
  return n === 1 ? '1 reporte pendiente' : `${n} reportes pendientes`;
}

/**
 * US-06: aviso NO modal cuando hay reportes en cola y no hay sesion valida
 * (nunca la hubo, se cerro o vencio). No interrumpe: solo ofrece el enlace
 * al login, que vuelve a esta misma pantalla.
 */
export function AvisoPendientesSinSesion({ cantidad, ruta }: { cantidad: number; ruta: string }) {
  // En las pantallas de acceso no tiene sentido pedir que inicie sesion: ya
  // esta en eso (y desde `/confirmar-cuenta`, volver sin el token mostraria
  // un enlace invalido).
  if (cantidad === 0 || RUTAS_DE_ACCESO.some((r) => ruta.startsWith(r))) return null;
  return (
    <p
      role="status"
      className="fixed inset-x-4 bottom-[calc(var(--cv-alto-nav,0px)+1rem)] z-[1100] mx-auto max-w-lg rounded-control border border-aviso-borde bg-aviso-fondo px-4 py-3 text-sm text-aviso-texto shadow-elevada"
    >
      Tienes {plural(cantidad)} de envío:{' '}
      <Link
        href={`/login?redirect=${encodeURIComponent(ruta)}`}
        className="font-medium text-enlace underline"
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
      className="fixed inset-x-4 bottom-[calc(var(--cv-alto-nav,0px)+3rem)] z-[1100] mx-auto flex max-w-lg items-start gap-3 rounded-control border border-aviso-borde bg-aviso-fondo px-4 py-3 text-sm text-aviso-texto shadow-elevada"
    >
      <p className="flex-1">
        {cantidad === 1
          ? 'Tienes 1 reporte sin enviar al que le faltan datos: '
          : `Tienes ${cantidad} reportes sin enviar a los que les faltan datos: `}
        <Link
          href={RUTA_PENDIENTES_DE_ENVIO}
          className="font-medium text-enlace underline"
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
 * "Conservar", la opcion por defecto (no se pierde nada). Al abrirse, el
 * foco va a "Conservar" (DIS-1): la accion menos destructiva, y asi el foco
 * no queda en lo que el dialogo tapa (el menu de cuenta desde donde se pidio).
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
  const conservar = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    conservar.current?.focus();
  }, []);

  useEffect(() => {
    const alPulsar = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape') onConservar();
    };
    document.addEventListener('keydown', alPulsar);
    return () => document.removeEventListener('keydown', alPulsar);
  }, [onConservar]);

  return (
    <div className="fixed inset-0 z-[1200] flex items-center justify-center bg-velo p-4">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="cierre-pendientes-titulo"
        className="flex w-full max-w-md flex-col gap-4 rounded-tarjeta bg-superficie p-6 shadow-elevada"
      >
        <h2 id="cierre-pendientes-titulo" className="text-lg font-semibold text-texto">
          {cantidad === 1
            ? 'Tienes 1 reporte sin enviar en este dispositivo.'
            : `Tienes ${cantidad} reportes sin enviar en este dispositivo.`}
        </h2>
        <p className="text-sm text-texto">
          {textoDelCierre(seEnviaran, requierenAccion)}
        </p>
        <div className="flex flex-wrap justify-end gap-3">
          <button
            type="button"
            onClick={onDescartar}
            className={clasesDeBoton('peligro')}
          >
            Descartarlos
          </button>
          <button
            ref={conservar}
            type="button"
            onClick={onConservar}
            className={clasesDeBoton('primario')}
          >
            Conservar
          </button>
        </div>
      </div>
    </div>
  );
}

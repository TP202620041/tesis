'use client';

import { AlertaError } from '@/components/ui/form';
import type { usePushEnEsteNavegador } from '../hooks/usePushEnEsteNavegador';
import { textoDeEstadoPush } from '../model/push';

type EstadoPushNavegador = ReturnType<typeof usePushEnEsteNavegador>;

const BOTON =
  'self-start rounded-md border border-slate-300 px-3 py-1 text-xs text-slate-700 hover:bg-slate-100 ' +
  'disabled:opacity-60 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700';

/**
 * US-21: activar o desactivar push en ESTE navegador, dentro de la fila del
 * consentimiento push del perfil. Sin consentimiento ofrece otorgarlo y
 * activar en un solo paso; sin soporte, sin claves en el servidor o con el
 * permiso bloqueado solo explica por que no se puede.
 */
export function PushEnEsteNavegador({ push }: { push: EstadoPushNavegador }) {
  const { estado, consentido, procesando, error, activar, desactivar } = push;

  return (
    <div className="flex flex-col gap-1.5 border-t border-slate-200 pt-2 dark:border-slate-700">
      <p className="text-xs font-medium text-slate-700 dark:text-slate-200">En este navegador</p>
      {estado === null && !error && <p className="text-xs text-slate-500">Comprobando…</p>}
      {estado !== null && (
        <p aria-live="polite" className="text-xs text-slate-600 dark:text-slate-400">
          {consentido || estado !== 'activo'
            ? textoDeEstadoPush(estado)
            : 'Este navegador tiene una suscripción, pero falta tu consentimiento para recibir push.'}
        </p>
      )}
      {error && <AlertaError mensaje={error.mensaje} detalles={error.detalles} />}

      {(estado === 'inactivo' || (estado === 'activo' && !consentido)) && (
        <button type="button" disabled={procesando} onClick={() => void activar()} className={BOTON}>
          {procesando
            ? 'Activando…'
            : consentido
              ? 'Activar notificaciones push aquí'
              : 'Otorgar consentimiento y activar aquí'}
        </button>
      )}
      {estado === 'activo' && consentido && (
        <button type="button" disabled={procesando} onClick={() => void desactivar()} className={BOTON}>
          {procesando ? 'Desactivando…' : 'Desactivar en este navegador'}
        </button>
      )}
    </div>
  );
}

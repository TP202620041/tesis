'use client';

import { clasesDeBoton } from '@/components/ui/Boton';
import { AlertaError } from '@/components/ui/form';
import type { usePushEnEsteNavegador } from '../hooks/usePushEnEsteNavegador';
import { textoDeEstadoPush } from '../model/push';

type EstadoPushNavegador = ReturnType<typeof usePushEnEsteNavegador>;

const BOTON = `${clasesDeBoton('secundario', 'compacto')} self-start`;

/**
 * US-21: activar o desactivar push en ESTE navegador, dentro de la fila del
 * consentimiento push del perfil. Sin consentimiento ofrece otorgarlo y
 * activar en un solo paso; sin soporte, sin claves en el servidor o con el
 * permiso bloqueado solo explica por que no se puede.
 */
export function PushEnEsteNavegador({ push }: { push: EstadoPushNavegador }) {
  const { estado, consentido, procesando, error, activar, desactivar } = push;

  return (
    <div className="flex flex-col gap-1.5 border-t border-linea pt-2">
      <p className="text-xs font-medium text-texto">En este navegador</p>
      {estado === null && !error && <p className="text-xs text-texto-2">Comprobando…</p>}
      {estado !== null && (
        <p aria-live="polite" className="text-xs text-texto-2">
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

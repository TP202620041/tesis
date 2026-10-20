'use client';

import { useCallback, useEffect, useState } from 'react';
import { ApiError, mensajeDeError, type MensajeDeError } from '@/lib/api/errors';
import { useCarga } from '@/lib/hooks/useCarga';
import { tieneVigente } from '../model/consentimientos';
import type { EstadoPush } from '../model/push';
import { activarPush, desactivarPush, estadoDePush, reRegistrarPushAlIniciarSesion } from './push';
import type { EstadoConsentimientos } from './useConsentimientos';

/**
 * Traduce un fallo al activar o desactivar. Ademas de los del API, aqui
 * llegan los del navegador: sin Service Worker activo o un `subscribe`
 * rechazado.
 */
function errorDePush(e: unknown): MensajeDeError {
  if (e instanceof ApiError && e.status === 409) {
    return { mensaje: 'Primero otorga el consentimiento para notificaciones push.', detalles: [] };
  }
  if (e instanceof Error && e.name === 'SinServiceWorkerError') {
    return { mensaje: e.message, detalles: [] };
  }
  if (e instanceof DOMException) {
    return { mensaje: 'El navegador no permitió activar las notificaciones push.', detalles: [] };
  }
  return mensajeDeError(e);
}

/**
 * US-21, perfil: push en ESTE navegador, sobre el consentimiento
 * `NOTIFICACIONES_PUSH` (D-12: sin el, el servidor no registra la
 * suscripcion).
 *
 * - `activar`: si falta el consentimiento, lo otorga primero (el usuario
 *   pulso «otorgar y activar»); despues permiso del navegador, `subscribe`
 *   y registro.
 * - `desactivar`: solo este navegador (conserva el permiso para los demas).
 * - `retirarConsentimiento`: revoca el permiso (el servidor borra las
 *   suscripciones de TODOS los navegadores) y cancela la de este.
 *
 * Con consentimiento y una suscripcion ya presente, la vuelve a registrar
 * en segundo plano: la suscripcion puede venir de antes de otorgar el
 * consentimiento (el registro habia dado 409) o de otro usuario del
 * dispositivo.
 */
export function usePushEnEsteNavegador(consentimientos: EstadoConsentimientos) {
  const carga = useCarga<EstadoPush>(() => estadoDePush(), []);
  const [tras, setTras] = useState<EstadoPush | null>(null);
  const [procesando, setProcesando] = useState(false);
  const [error, setError] = useState<MensajeDeError | null>(null);
  const datos = consentimientos.carga.datos;
  const consentido = datos ? tieneVigente(datos, 'NOTIFICACIONES_PUSH') : false;
  const estado = tras ?? (carga.estado === 'listo' ? carga.datos : null);
  const { otorgar, revocar } = consentimientos;

  // Solo sobre el estado detectado al cargar: tras `activar` ya se registro.
  const detectado = carga.estado === 'listo' ? carga.datos : null;
  useEffect(() => {
    if (consentido && tras === null && detectado === 'activo') void reRegistrarPushAlIniciarSesion();
  }, [consentido, tras, detectado]);

  const ejecutar = useCallback(async (accion: () => Promise<EstadoPush | null>) => {
    setError(null);
    setProcesando(true);
    try {
      const nuevo = await accion();
      if (nuevo) setTras(nuevo);
    } catch (e) {
      setError(errorDePush(e));
    } finally {
      setProcesando(false);
    }
  }, []);

  const activar = useCallback(
    () =>
      ejecutar(async () => {
        if (!consentido && !(await otorgar('NOTIFICACIONES_PUSH'))) return null;
        return activarPush();
      }),
    [ejecutar, consentido, otorgar],
  );

  const desactivar = useCallback(() => ejecutar(() => desactivarPush()), [ejecutar]);

  const retirarConsentimiento = useCallback(
    () =>
      ejecutar(async () => {
        if (!(await revocar('NOTIFICACIONES_PUSH'))) return null;
        // El servidor ya borro todas las suscripciones: aqui solo la local.
        return desactivarPush({ soloLocal: true });
      }),
    [ejecutar, revocar],
  );

  return {
    estado,
    consentido,
    procesando,
    error: error ?? (carga.estado === 'error' ? carga.error : null),
    activar,
    desactivar,
    retirarConsentimiento,
  };
}

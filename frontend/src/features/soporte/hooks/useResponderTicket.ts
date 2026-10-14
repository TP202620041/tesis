'use client';

import { useCallback, useState } from 'react';
import { mensajeDeError, type MensajeDeError } from '@/lib/api/errors';
import { responderTicket } from '../api';
import { erroresDeRespuesta } from '../model/tickets';
import type { RespuestaTicket } from '../model/tipos';

/**
 * US-25 Esc. 2: el ADMIN responde un ticket. Devuelve `true` si se guardó,
 * para que la bandeja recargue la página actual (handoff de soporte).
 */
export function useResponderTicket() {
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<MensajeDeError | null>(null);

  const responder = useCallback(async (id: number, r: RespuestaTicket): Promise<boolean> => {
    setError(null);
    const errores = erroresDeRespuesta(r);
    if (errores.length > 0) {
      setError({ mensaje: 'Revisa la respuesta antes de enviarla.', detalles: errores });
      return false;
    }
    setEnviando(true);
    try {
      await responderTicket(id, r);
      return true;
    } catch (e) {
      setError(mensajeDeError(e));
      return false;
    } finally {
      setEnviando(false);
    }
  }, []);

  return { responder, enviando, error };
}

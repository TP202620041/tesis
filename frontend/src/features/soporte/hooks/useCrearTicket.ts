'use client';

import { useCallback, useState } from 'react';
import { mensajeDeError, type MensajeDeError } from '@/lib/api/errors';
import { crearTicket } from '../api';
import { erroresDeTicket } from '../model/tickets';
import type { NuevoTicket, TicketPropio } from '../model/tipos';

/**
 * US-25 Esc. 1: envía un ticket. Valida antes con las mismas reglas del
 * backend y devuelve el ticket creado (o `null` si no se envió).
 */
export function useCrearTicket() {
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<MensajeDeError | null>(null);

  const crear = useCallback(async (nuevo: NuevoTicket): Promise<TicketPropio | null> => {
    setError(null);
    const errores = erroresDeTicket(nuevo);
    if (errores.length > 0) {
      setError({ mensaje: 'Revisa los datos antes de enviar.', detalles: errores });
      return null;
    }
    setEnviando(true);
    try {
      return await crearTicket(nuevo);
    } catch (e) {
      setError(mensajeDeError(e));
      return null;
    } finally {
      setEnviando(false);
    }
  }, []);

  return { crear, enviando, error };
}

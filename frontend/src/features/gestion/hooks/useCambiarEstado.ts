'use client';

import { useCallback, useState } from 'react';
import { mensajeDeError, type MensajeDeError } from '@/lib/api/errors';
import { cambiarEstado } from '../api';
import { exigeComentario } from '../model/transiciones';
import type { ReporteGestion } from '../model/tipos';

/**
 * US-14: el funcionario mueve el reporte por la maquina de estados.
 * Devuelve el reporte actualizado, o `null` si no se cambio.
 *
 * El backend responde 400 si se rechaza sin justificar; se exige antes de
 * enviar para que el funcionario no pierda lo escrito. 409 = transicion
 * invalida (el backend es la autoridad); 403 = el reporte no es de su
 * distrito. Ambos llegan con su mensaje.
 */
export function useCambiarEstado() {
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<MensajeDeError | null>(null);

  const cambiar = useCallback(
    async (reporteId: number, destino: string, comentario: string): Promise<ReporteGestion | null> => {
      setError(null);
      if (!destino) return null;
      if (exigeComentario(destino) && !comentario.trim()) {
        setError({ mensaje: 'Para rechazar un reporte debes explicar el motivo.', detalles: [] });
        return null;
      }
      setEnviando(true);
      try {
        return await cambiarEstado(reporteId, destino, comentario);
      } catch (e) {
        setError(mensajeDeError(e));
        return null;
      } finally {
        setEnviando(false);
      }
    },
    [],
  );

  return { cambiar, enviando, error };
}

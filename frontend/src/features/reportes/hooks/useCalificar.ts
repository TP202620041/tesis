'use client';

import { useCallback, useState } from 'react';
import { mensajeDeError, type MensajeDeError } from '@/lib/api/errors';
import { useCarga } from '@/lib/hooks/useCarga';
import { calificar, miCalificacion } from '../api';
import type { Calificacion } from '../model/tipos';

/**
 * US-26: la calificacion del ciudadano sobre un reporte resuelto.
 *
 * Al montarse consulta si ya califico (`existente`). Un fallo en esa
 * consulta no impide calificar: se trata como "todavia no", y si ya lo hizo
 * el 409 del POST lo dira. Tras calificar se adopta la respuesta del
 * servidor, no lo escrito localmente: lo que se muestra es exactamente lo
 * que quedo guardado.
 */
export function useCalificar(reporteId: number) {
  const carga = useCarga<Calificacion | null>(
    () => miCalificacion(reporteId).catch(() => null),
    [reporteId],
  );
  const [emitida, setEmitida] = useState<{ reporteId: number; calificacion: Calificacion } | null>(
    null,
  );
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<MensajeDeError | null>(null);

  /** 409 = ya calificaste, o el reporte no esta resuelto. */
  const enviar = useCallback(
    async (estrellas: number, comentario: string): Promise<boolean> => {
      setError(null);
      if (estrellas < 1) {
        setError({ mensaje: 'Elige de 1 a 5 estrellas.', detalles: [] });
        return false;
      }
      setEnviando(true);
      try {
        const calificacion = await calificar(reporteId, estrellas, comentario);
        setEmitida({ reporteId, calificacion });
        return true;
      } catch (e) {
        setError(mensajeDeError(e));
        return false;
      } finally {
        setEnviando(false);
      }
    },
    [reporteId],
  );

  const existente =
    emitida?.reporteId === reporteId ? emitida.calificacion : (carga.datos ?? null);

  return { cargando: carga.estado === 'cargando', existente, enviar, enviando, error };
}

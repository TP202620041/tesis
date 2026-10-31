'use client';

import { useCallback, useState } from 'react';
import { ApiError, mensajeDeError, type MensajeDeError } from '@/lib/api/errors';
import { useCarga } from '@/lib/hooks/useCarga';
import { textoRechazado as textoRechazadoDe, type TextoRechazado } from '@/lib/types/moderacion';
import { comentar, listarComentarios } from '../api';
import type { ComentarioPublico } from '../model/tipos';

const SIN_COMENTARIOS: ComentarioPublico[] = [];

/**
 * US-27: comentarios publicos de un reporte resuelto y la publicacion de
 * uno nuevo.
 *
 * Leer es publico; si la lectura falla se muestra la lista vacia. Tras
 * publicar se vuelve a pedir la lista (sin desmontarla: `useCarga` conserva
 * la anterior mientras recarga), porque el backend decide el autor y la
 * fecha que se muestran.
 *
 * NC-10c: el 400 `TEXTO_NO_PERMITIDO` del comentario queda en
 * `textoRechazado` (con lo que se escribio), para mostrarlo en el campo, y no
 * en `error`.
 */
export function useComentarios(reporteId: number) {
  const carga = useCarga<ComentarioPublico[]>(
    () => listarComentarios(reporteId).catch(() => SIN_COMENTARIOS),
    [reporteId],
  );
  const { recargar } = carga;
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<MensajeDeError | null>(null);
  const [textoRechazado, setTextoRechazado] = useState<TextoRechazado | null>(null);

  /** Devuelve `true` si se publico. 409 = el reporte no esta resuelto. */
  const publicar = useCallback(
    async (contenido: string): Promise<boolean> => {
      setError(null);
      setTextoRechazado(null);
      if (!contenido.trim()) return false;
      setEnviando(true);
      try {
        await comentar(reporteId, contenido);
        recargar();
        return true;
      } catch (e) {
        const rechazo = e instanceof ApiError ? textoRechazadoDe(e, { contenido }) : null;
        if (rechazo) setTextoRechazado(rechazo);
        else setError(mensajeDeError(e));
        return false;
      } finally {
        setEnviando(false);
      }
    },
    [reporteId, recargar],
  );

  return {
    cargando: carga.estado === 'cargando',
    comentarios: carga.datos ?? SIN_COMENTARIOS,
    publicar,
    enviando,
    error,
    textoRechazado,
  };
}

'use client';

import { useCallback, useState } from 'react';
import { mensajeDeError, type MensajeDeError } from '@/lib/api/errors';
import { useCarga } from '@/lib/hooks/useCarga';
import { asignarResponsable, responsableActivo } from '../api';
import type { AsignacionResponsable } from '../model/tipos';

/**
 * US-15: responsable interno vigente del reporte y su (re)asignacion.
 *
 * Se vuelve a consultar cuando cambia el estado (un cambio de estado puede
 * cerrar la asignacion). Un fallo al consultarlo se muestra como "sin
 * responsable", igual que el 404 que `api.ts` ya traduce a `null`.
 *
 * Tras asignar se adopta la respuesta del servidor, sin otra consulta: lo
 * que se muestra es exactamente lo que quedo guardado. Esa asignacion vale
 * solo para el reporte y estado en que se hizo.
 */
export function useResponsable(reporteId: number, estado: string) {
  const carga = useCarga<AsignacionResponsable | null>(
    () => responsableActivo(reporteId).catch(() => null),
    [reporteId, estado],
  );
  const clave = JSON.stringify([reporteId, estado]);
  const [asignada, setAsignada] = useState<{ clave: string; asignacion: AsignacionResponsable } | null>(
    null,
  );
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<MensajeDeError | null>(null);

  /** Devuelve `true` si se asigno. 409 = el estado no la admite; 403 = otro distrito. */
  const asignar = useCallback(
    async (responsable: string, notas: string): Promise<boolean> => {
      setError(null);
      if (!responsable.trim()) return false;
      setEnviando(true);
      try {
        const asignacion = await asignarResponsable(reporteId, responsable, notas);
        setAsignada({ clave, asignacion });
        return true;
      } catch (e) {
        setError(mensajeDeError(e));
        return false;
      } finally {
        setEnviando(false);
      }
    },
    [reporteId, clave],
  );

  const actual = asignada?.clave === clave ? asignada.asignacion : (carga.datos ?? null);

  return { cargando: carga.estado === 'cargando', actual, asignar, enviando, error };
}

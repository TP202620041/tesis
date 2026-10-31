'use client';

import { useCallback, useState } from 'react';
import { ApiError, mensajeDeError } from '@/lib/api/errors';
import { useCarga } from '@/lib/hooks/useCarga';
import type { HistorialEntrada } from '@/lib/types/domain';
import {
  desestimarDenuncias,
  detalleDeModeracion,
  historialDeModeracion,
  ocultarContenido,
  restablecerContenido,
} from '../api';
import { errorDeModeracion } from '../model/moderacion';
import type { DetalleDeModeracion, OrdenDeModeracion, ReporteEnModeracion } from '../model/tipos';

/** Que hizo cada accion. */
export type ResultadoDeAccion =
  | { ok: true }
  /** El motivo no sirve: va en su campo. */
  | { ok: false; campo: 'motivo'; mensaje: string }
  /** Error general; `desactualizado` si el estado del reporte ya no era el que se veia (se recargo). */
  | { ok: false; campo: null; mensaje: string; desactualizado: boolean };

export type OperacionEnCurso = 'ocultar' | 'restablecer' | 'desestimar' | null;

/**
 * NC-11b: el detalle de un reporte en moderacion, con sus denuncias y su
 * linea de tiempo, y las tres acciones del ADMIN.
 *
 * Tras una accion se adopta el reporte que devuelve el servidor (es lo que
 * quedo guardado) y se vuelve a pedir el historial, sin desmontar la pantalla
 * (`useCarga` conserva los datos mientras recarga). Un 409 del estado
 * (`YA_OCULTO`, `NO_OCULTO`, `SIN_FOTO`) quiere decir que lo que se veia
 * estaba viejo: se recarga todo ademas de avisar. Un historial que falla se
 * muestra vacio: no impide moderar.
 */
export function useDetalleModeracion(reporteId: number) {
  const carga = useCarga<DetalleDeModeracion>(async () => {
    const [reporte, historial] = await Promise.all([
      detalleDeModeracion(reporteId),
      historialDeModeracion(reporteId).catch(() => [] as HistorialEntrada[]),
    ]);
    return { reporte, historial };
  }, [reporteId]);
  const { recargar } = carga;
  const [operacion, setOperacion] = useState<OperacionEnCurso>(null);

  const ejecutar = useCallback(
    async (
      nombre: Exclude<OperacionEnCurso, null>,
      accion: () => Promise<ReporteEnModeracion>,
    ): Promise<ResultadoDeAccion> => {
      setOperacion(nombre);
      try {
        await accion();
        // El servidor ya tiene el reporte nuevo y una entrada mas en la linea
        // de tiempo: se vuelve a pedir todo junto (sin desmontar).
        recargar();
        return { ok: true };
      } catch (e) {
        const propio = e instanceof ApiError ? errorDeModeracion(e) : null;
        if (propio?.campo === 'motivo') return { ok: false, campo: 'motivo', mensaje: propio.mensaje };
        if (propio) {
          recargar();
          return { ok: false, campo: null, mensaje: propio.mensaje, desactualizado: true };
        }
        return { ok: false, campo: null, mensaje: mensajeDeError(e).mensaje, desactualizado: false };
      } finally {
        setOperacion(null);
      }
    },
    [recargar],
  );

  const ocultar = useCallback(
    (orden: OrdenDeModeracion) => ejecutar('ocultar', () => ocultarContenido(reporteId, orden)),
    [ejecutar, reporteId],
  );
  const restablecer = useCallback(
    (orden: OrdenDeModeracion) => ejecutar('restablecer', () => restablecerContenido(reporteId, orden)),
    [ejecutar, reporteId],
  );
  const desestimar = useCallback(
    (motivo?: string) => ejecutar('desestimar', () => desestimarDenuncias(reporteId, motivo)),
    [ejecutar, reporteId],
  );

  return { ...carga, operacion, ocultar, restablecer, desestimar };
}

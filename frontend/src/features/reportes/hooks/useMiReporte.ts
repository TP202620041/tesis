'use client';

import { useRef } from 'react';
import { mensajeDeError, type MensajeDeError } from '@/lib/api/errors';
import { useCarga } from '@/lib/hooks/useCarga';
import type { HistorialEntrada } from '@/lib/types/domain';
import { historialDeReporte, misReportes } from '../api';
import type { ReporteResumen } from '../model/tipos';

export interface MiReporte {
  /** `null` si no esta entre los reportes del ciudadano (no es suyo o no existe). */
  reporte: ReporteResumen | null;
  entradas: HistorialEntrada[];
  /**
   * Fallo de una RECARGA (tras editar o retirar): se conservan los datos que
   * ya se veian y se avisa, en vez de pasar a "Reporte no disponible".
   */
  errorDeRecarga: MensajeDeError | null;
}

/**
 * Seguimiento de un reporte propio: el reporte y su historial (US-22).
 *
 * El API no expone `GET /api/reportes/{id}` con los datos del creador, asi
 * que el reporte se busca dentro de "mis reportes". Efecto util: si no
 * aparece ahi es que no es suyo (o no existe), que es exactamente lo que hay
 * que decirle. Un historial que falla se muestra vacio.
 */
export function useMiReporte(reporteId: number) {
  // Ultimos datos buenos de ESTE reporte, para sobrevivir a una recarga fallida.
  const ultimos = useRef<{ reporteId: number; datos: MiReporte } | null>(null);

  return useCarga<MiReporte>(async () => {
    try {
      const [lista, entradas] = await Promise.all([
        misReportes(),
        historialDeReporte(reporteId).catch(() => [] as HistorialEntrada[]),
      ]);
      const datos: MiReporte = {
        reporte: lista.find((r) => r.id === reporteId) ?? null,
        entradas,
        errorDeRecarga: null,
      };
      ultimos.current = { reporteId, datos };
      return datos;
    } catch (e) {
      const previos = ultimos.current;
      if (previos?.reporteId === reporteId && previos.datos.reporte) {
        return { ...previos.datos, errorDeRecarga: mensajeDeError(e) };
      }
      throw e;
    }
  }, [reporteId]);
}

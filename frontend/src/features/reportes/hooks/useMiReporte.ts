'use client';

import { useCarga } from '@/lib/hooks/useCarga';
import type { HistorialEntrada } from '@/lib/types/domain';
import { historialDeReporte, misReportes } from '../api';
import type { ReporteResumen } from '../model/tipos';

export interface MiReporte {
  /** `null` si no esta entre los reportes del ciudadano (no es suyo o no existe). */
  reporte: ReporteResumen | null;
  entradas: HistorialEntrada[];
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
  return useCarga<MiReporte>(async () => {
    const [lista, entradas] = await Promise.all([
      misReportes(),
      historialDeReporte(reporteId).catch(() => [] as HistorialEntrada[]),
    ]);
    return { reporte: lista.find((r) => r.id === reporteId) ?? null, entradas };
  }, [reporteId]);
}

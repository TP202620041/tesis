'use client';

import { useCarga } from '@/lib/hooks/useCarga';
import { misReportes, pendientesDeCalificacion } from '../api';
import type { ReporteResumen } from '../model/tipos';

export interface MisReportes {
  reportes: ReporteResumen[];
  /** US-26 (Esc. 2): resueltos hace 3+ dias que siguen sin calificar. */
  porCalificar: ReporteResumen[];
}

/**
 * US-07: los reportes que el ciudadano envio, mas el recordatorio de US-26.
 *
 * El recordatorio es una consulta aparte: el backend aplica ahi la regla de
 * "resuelto hace 3+ dias sin calificar". Si esa falla, el recordatorio
 * simplemente no aparece; solo un fallo de la lista principal es un error.
 */
export function useMisReportes() {
  return useCarga<MisReportes>(async () => {
    const [reportes, porCalificar] = await Promise.all([
      misReportes(),
      pendientesDeCalificacion().catch(() => [] as ReporteResumen[]),
    ]);
    return { reportes, porCalificar };
  }, []);
}

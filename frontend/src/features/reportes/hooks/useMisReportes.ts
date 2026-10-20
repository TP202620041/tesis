'use client';

import { useEffect } from 'react';
import { useCarga } from '@/lib/hooks/useCarga';
import { colaDeReportes, misReportes, pendientesDeCalificacion } from '../api';
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
 *
 * US-06: cuando cambia la cola offline (p. ej. se envio un reporte que
 * estaba "Pendiente de envío") la lista se vuelve a pedir, sin parpadeo
 * (`recargar` conserva los datos visibles).
 */
export function useMisReportes() {
  const carga = useCarga<MisReportes>(async () => {
    const [reportes, porCalificar] = await Promise.all([
      misReportes(),
      pendientesDeCalificacion().catch(() => [] as ReporteResumen[]),
    ]);
    return { reportes, porCalificar };
  }, []);
  const { recargar } = carga;
  useEffect(() => colaDeReportes.suscribir(recargar), [recargar]);
  return carga;
}

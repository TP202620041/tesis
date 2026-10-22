'use client';

import { useEffect } from 'react';
import { useCarga } from '@/lib/hooks/useCarga';
import { colaDeReportes, misAdhesiones } from '../api';
import type { ReporteResumen } from '../model/tipos';

/**
 * QA-1 M-6 (US-09): reportes de otros vecinos que el ciudadano apoya.
 *
 * Carga aparte de `useMisReportes`: si esta falla (p. ej. contra un
 * backend anterior a QA-1, que no tiene la ruta), la lista de lo que el
 * ciudadano envió se ve igual y solo esta sección muestra el error.
 *
 * US-06: se vuelve a pedir cuando cambia la cola offline, sin parpadeo
 * (`recargar` conserva los datos visibles): un reporte que estaba
 * «Pendiente de envío» puede resultar, al enviarse, una adhesión a uno
 * cercano, y entonces aparece aquí y no en la lista propia.
 */
export function useReportesQueApoyas() {
  const carga = useCarga<ReporteResumen[]>(() => misAdhesiones(), []);
  const { recargar } = carga;
  useEffect(() => colaDeReportes.suscribir(recargar), [recargar]);
  return carga;
}

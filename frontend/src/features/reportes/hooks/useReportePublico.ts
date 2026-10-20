'use client';

import { useCarga } from '@/lib/hooks/useCarga';
import { reportePorId } from '../api';
import type { ReporteResumen } from '../model/tipos';

/**
 * Detalle PUBLICO de un reporte (US-10 / US-27), sin token. `datos` es
 * `null` si no existe o fue retirado por su creador (el backend responde 404
 * en ambos casos); cualquier otro fallo deja la carga en `error`, que la
 * pantalla trata igual: "no disponible".
 */
export function useReportePublico(reporteId: number) {
  return useCarga<ReporteResumen | null>(() => reportePorId(reporteId), [reporteId]);
}

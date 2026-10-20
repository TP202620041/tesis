'use client';

import { useCarga } from '@/lib/hooks/useCarga';
import type { HistorialEntrada } from '@/lib/types/domain';
import { bandeja, historial } from '../api';
import { FILTROS_BANDEJA_VACIOS, type ReporteGestion } from '../model/tipos';

export interface DetalleGestion {
  /** `null` si no esta en la bandeja: no es de su distrito o no existe. */
  reporte: ReporteGestion | null;
  entradas: HistorialEntrada[];
}

/**
 * US-14/US-15/US-22: un reporte de la bandeja y su historial de gestion.
 *
 * El API no expone `GET /api/reportes/{id}` con la vista de gestion, asi que
 * el reporte se localiza dentro de la bandeja del funcionario. Tiene un
 * efecto util: si no aparece ahi es que no pertenece a su distrito (o no
 * existe), que es exactamente lo que hay que mostrarle. Un historial que
 * falla se muestra vacio.
 */
export function useDetalleGestion(reporteId: number) {
  return useCarga<DetalleGestion>(async () => {
    const [lista, entradas] = await Promise.all([
      bandeja(FILTROS_BANDEJA_VACIOS),
      historial(reporteId).catch(() => [] as HistorialEntrada[]),
    ]);
    return { reporte: lista.find((r) => r.id === reporteId) ?? null, entradas };
  }, [reporteId]);
}

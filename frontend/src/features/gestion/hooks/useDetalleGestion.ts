'use client';

import { useRef } from 'react';
import { mensajeDeError, type MensajeDeError } from '@/lib/api/errors';
import { useCarga } from '@/lib/hooks/useCarga';
import type { HistorialEntrada } from '@/lib/types/domain';
import { bandeja, historial } from '../api';
import { FILTROS_BANDEJA_VACIOS, type ReporteGestion } from '../model/tipos';

export interface DetalleGestion {
  /** `null` si no esta en la bandeja: no es de su distrito o no existe. */
  reporte: ReporteGestion | null;
  entradas: HistorialEntrada[];
  /**
   * Fallo de una RECARGA (tras cambiar el estado): se conservan los datos que
   * ya se veian y se avisa, en vez de pasar a "Reporte no disponible".
   */
  errorDeRecarga: MensajeDeError | null;
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
  // Ultimos datos buenos de ESTE reporte, para sobrevivir a una recarga fallida.
  const ultimos = useRef<{ reporteId: number; datos: DetalleGestion } | null>(null);

  return useCarga<DetalleGestion>(async () => {
    try {
      const [lista, entradas] = await Promise.all([
        bandeja(FILTROS_BANDEJA_VACIOS),
        historial(reporteId).catch(() => [] as HistorialEntrada[]),
      ]);
      const datos: DetalleGestion = {
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

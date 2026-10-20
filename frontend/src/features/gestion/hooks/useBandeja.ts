'use client';

import { listarCategorias } from '@/lib/api/catalogos';
import { useCarga } from '@/lib/hooks/useCarga';
import type { CategoriaDano } from '@/lib/types/domain';
import { bandeja } from '../api';
import type { FiltrosBandeja, ReporteGestion } from '../model/tipos';

/** US-13: reportes del distrito del funcionario, segun los filtros. */
export function useBandeja(filtros: FiltrosBandeja) {
  return useCarga<ReporteGestion[]>(() => bandeja(filtros), [filtros]);
}

const SIN_CATEGORIAS: CategoriaDano[] = [];

/**
 * Categorias del distrito del funcionario para el filtro: incluye las
 * propias de su municipalidad (US-29), no solo las estandar. Si falla, el
 * filtro queda solo con "Todos".
 */
export function useCategoriasDelDistrito(distritoId: number | null): CategoriaDano[] {
  const carga = useCarga<CategoriaDano[]>(
    () => listarCategorias(distritoId).catch(() => [] as CategoriaDano[]),
    [distritoId],
  );
  return carga.datos ?? SIN_CATEGORIAS;
}

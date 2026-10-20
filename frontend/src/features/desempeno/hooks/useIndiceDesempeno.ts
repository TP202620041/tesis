'use client';

import { listarCategorias } from '@/lib/api/catalogos';
import { useCarga } from '@/lib/hooks/useCarga';
import type { CategoriaDano } from '@/lib/types/domain';
import { rankingDistrital } from '../api';
import type { DesempenoDistrital } from '../model/formato';

/** US-18/US-20: indice publico por distrito, opcionalmente de un tipo de dano. */
export function useRankingDistrital(categoriaId: number | null) {
  return useCarga<DesempenoDistrital[]>(() => rankingDistrital(categoriaId), [categoriaId]);
}

const SIN_CATEGORIAS: CategoriaDano[] = [];

/**
 * US-20: tipos de dano del filtro (solo los estandar: el indice es de toda
 * Lima). Si falla, el selector queda solo con "Todos los tipos".
 */
export function useCategoriasDelIndice(): CategoriaDano[] {
  const carga = useCarga<CategoriaDano[]>(
    () => listarCategorias().catch(() => [] as CategoriaDano[]),
    [],
  );
  return carga.datos ?? SIN_CATEGORIAS;
}

'use client';

import { useMemo } from 'react';
import { listarCategorias, listarDistritos } from '@/lib/api/catalogos';
import { useCarga } from '@/lib/hooks/useCarga';
import type { CategoriaDano, Distrito } from '@/lib/types/domain';
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

const SIN_DISTRITOS: Distrito[] = [];

/**
 * US-19: nombres de los 43 distritos, por id. La comparacion los necesita
 * para un distrito elegido que no tiene fila con el tipo de dano filtrado
 * (el indice solo devuelve los que tienen reportes de ese tipo).
 *
 * `null` mientras carga o si fallo: «todavia no se sabe que distritos
 * existen», distinto de un catalogo vacio. Asi no se descarta una
 * seleccion valida por un fallo del catalogo.
 */
export function useNombresDeDistritos(): ReadonlyMap<number, string> | null {
  const carga = useCarga<Distrito[]>(
    () => listarDistritos().catch(() => [] as Distrito[]),
    [],
  );
  const distritos = carga.datos ?? SIN_DISTRITOS;
  return useMemo(
    () => (distritos.length > 0 ? new Map(distritos.map((d) => [d.id, d.nombre])) : null),
    [distritos],
  );
}

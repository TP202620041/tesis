'use client';

import { useMemo } from 'react';
import { listarCategorias, listarDistritos } from '@/lib/api/catalogos';
import { useCarga } from '@/lib/hooks/useCarga';
import type { CategoriaDano, Distrito } from '@/lib/types/domain';
import { dashboardDeGestion, listarPeriodosDeGestion } from '../api';
import type { DashboardGestion, PeriodoGestion } from '../model/gestion';

/** NC-06: periodos de gestion del selector (el mas reciente primero). */
export function usePeriodosDeGestion() {
  return useCarga<PeriodoGestion[]>(() => listarPeriodosDeGestion(), []);
}

/**
 * NC-06: KPIs de cada municipalidad en un periodo, opcionalmente de un tipo
 * de dano. Con `periodoId` en `null` (los periodos todavia no cargaron, o no
 * hay ninguno) no consulta y queda en `null`: no se pide «el vigente» a
 * ciegas, que da 404 si hoy no cae en ningun periodo.
 */
export function useDashboardDeGestion(periodoId: number | null, categoriaId: number | null) {
  return useCarga<DashboardGestion | null>(
    () => (periodoId == null ? Promise.resolve(null) : dashboardDeGestion(periodoId, categoriaId)),
    [periodoId, categoriaId],
  );
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

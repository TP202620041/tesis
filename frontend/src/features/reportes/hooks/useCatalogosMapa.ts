'use client';

import { listarCategorias, listarDistritos } from '@/lib/api/catalogos';
import { useCarga } from '@/lib/hooks/useCarga';
import type { CategoriaDano, Distrito } from '@/lib/types/domain';

export interface CatalogosMapa {
  distritos: Distrito[];
  categorias: CategoriaDano[];
}

const VACIOS: CatalogosMapa = { distritos: [], categorias: [] };

/**
 * US-10: catalogos de los filtros del mapa publico. Son estables y se piden
 * una vez. Un catalogo que falla deja su selector vacio, sin aviso: el mapa
 * sigue sirviendo sin filtros.
 */
export function useCatalogosMapa(): CatalogosMapa {
  const carga = useCarga<CatalogosMapa>(async () => {
    const [distritos, categorias] = await Promise.all([
      listarDistritos().catch(() => [] as Distrito[]),
      listarCategorias().catch(() => [] as CategoriaDano[]),
    ]);
    return { distritos, categorias };
  }, []);
  return carga.datos ?? VACIOS;
}

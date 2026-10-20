'use client';

import { listarCategorias } from '@/lib/api/catalogos';
import { useCarga } from '@/lib/hooks/useCarga';
import type { CategoriaDano } from '@/lib/types/domain';

const SIN_CATEGORIAS: CategoriaDano[] = [];

/**
 * US-05/US-08 + US-29: categorias que se pueden elegir para un reporte.
 *
 * Dependen del distrito: sin el, el backend solo devuelve las 6 estandar;
 * con el, agrega las personalizadas de esa municipalidad (una personalizada
 * de otro distrito daria 409). Por eso se vuelven a pedir cuando cambia el
 * distrito. Mientras cargan, o si la consulta falla, la lista queda vacia:
 * el formulario no puede ofrecer lo que no sabe si es valido.
 */
export function useCategoriasDeReporte(distritoId: number | null): CategoriaDano[] {
  const carga = useCarga<CategoriaDano[]>(
    () => listarCategorias(distritoId).catch(() => [] as CategoriaDano[]),
    [distritoId],
  );
  return carga.datos ?? SIN_CATEGORIAS;
}

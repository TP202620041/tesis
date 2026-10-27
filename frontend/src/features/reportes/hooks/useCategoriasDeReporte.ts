'use client';

import { listarCategorias } from '@/lib/api/catalogos';
import { useCarga } from '@/lib/hooks/useCarga';
import type { CategoriaDano } from '@/lib/types/domain';
import type { EstadoDelCatalogo } from '../model/tipos';

const SIN_CATEGORIAS: CategoriaDano[] = [];

export interface CategoriasDeReporte {
  categorias: CategoriaDano[];
  /**
   * NC-04: la lista vacía no dice si todavía carga o si falló, y la
   * sugerencia por la foto necesita saberlo: mientras carga la espera; si
   * falló, no hay catálogo contra el que validarla.
   */
  estado: EstadoDelCatalogo;
}

/**
 * US-05/US-08 + US-29: categorias que se pueden elegir para un reporte.
 *
 * Dependen del distrito: sin el, el backend solo devuelve las estandar activas
 * (5 desde V19, que desactivo «Hueco en calzada»); con el, agrega las
 * personalizadas de esa municipalidad (una personalizada de otro distrito
 * daria 409). Por eso se vuelven a pedir cuando cambia el distrito. Mientras
 * cargan, o si la consulta falla, la lista queda vacia: el formulario no
 * puede ofrecer lo que no sabe si es valido.
 */
export function useCategoriasDeReporte(distritoId: number | null): CategoriasDeReporte {
  const carga = useCarga<CategoriaDano[]>(() => listarCategorias(distritoId), [distritoId]);
  if (carga.estado === 'listo') return { categorias: carga.datos, estado: 'listo' };
  return {
    categorias: SIN_CATEGORIAS,
    estado: carga.estado === 'error' ? 'fallido' : 'cargando',
  };
}

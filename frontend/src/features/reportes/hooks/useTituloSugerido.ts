'use client';

import { distritoPorCoordenadas, listarCategorias } from '@/lib/api/catalogos';
import { useCarga } from '@/lib/hooks/useCarga';
import type { DatosEnCola } from '../model/colaOffline';
import { tituloSugerido } from '../model/titulo';

/**
 * NC-02: titulo sugerido «<categoría> en <distrito>» para completar un
 * reporte de la cola que no tiene titulo (lo armo la version anterior del
 * formulario, que solo guardaba el id de la categoria y las coordenadas).
 *
 * El distrito se pregunta al backend con las coordenadas (el mismo
 * `ST_Covers` que asignara el reporte) y el nombre de la categoria sale del
 * catalogo de ese distrito (US-29: puede ser una propia). Si algo falla
 * (sin red, fuera de cobertura, categoria desactivada) la sugerencia queda
 * vacia: es solo una ayuda, el ciudadano escribe el titulo igual.
 *
 * Devuelve `null` mientras se calcula.
 */
export function useTituloSugerido(datos: DatosEnCola): string | null {
  const { latitud, longitud, categoriaId } = datos;
  const carga = useCarga<string>(async () => {
    const distrito = await distritoPorCoordenadas(latitud, longitud).catch(() => null);
    const categorias = await listarCategorias(distrito?.id ?? null).catch(() => []);
    const categoria = categorias.find((c) => c.id === categoriaId);
    return tituloSugerido(categoria?.nombre, distrito?.nombre);
  }, [latitud, longitud, categoriaId]);
  if (carga.estado === 'cargando') return null;
  return carga.datos ?? '';
}

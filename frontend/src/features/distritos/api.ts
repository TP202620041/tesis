import { api } from '@/lib/api/client';
import { ApiError } from '@/lib/api/errors';
import type { Distrito } from '@/lib/types/domain';

/** Catalogo de distritos y resolucion geografica (endpoints publicos). */

/** Los 43 distritos de Lima Metropolitana, en orden alfabetico. */
export function listarDistritos(): Promise<Distrito[]> {
  return api.get<Distrito[]>('/api/distritos', { conAuth: false });
}

/**
 * Distrito que contiene un punto GPS, o `null` si cae fuera de la cobertura
 * de Lima Metropolitana.
 *
 * Deliberadamente se le pregunta al backend en vez de calcularlo en el
 * cliente: es el MISMO `ST_Covers` que usa la asignacion automatica al crear
 * el reporte, asi que no puede discrepar de lo que el servidor decida. Hacer
 * point-in-polygon en JS exigiria descargar los poligonos de los 43 distritos
 * (miles de vertices) y duplicaria esa logica, con el riesgo de que las dos
 * implementaciones se separen.
 *
 * El 404 del backend ("fuera de cobertura") no es un error a mostrar como
 * fallo: es una respuesta valida que el formulario traduce en un aviso.
 */
export async function distritoPorCoordenadas(
  latitud: number,
  longitud: number,
): Promise<Distrito | null> {
  try {
    return await api.get<Distrito>(
      `/api/distritos/por-coordenadas?lat=${latitud}&lon=${longitud}`,
      { conAuth: false },
    );
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null;
    throw e;
  }
}

import { destinoInterno } from '@/features/auth/model/rutas';
import { esDiaValido } from '@/lib/types/fechas';
import { ESTADOS_EN_MAPA } from '@/lib/types/estados';
import type { FiltrosMapa } from './bbox';

/**
 * QA-1 M-9: filtros y vista de `/mapa` guardados en la URL
 * (`/mapa?distrito=21&categoria=1&estado=RESUELTO&desde=…&hasta=…&vista=lista`).
 *
 * La URL es la unica fuente de ese estado, como la comparacion de
 * `/desempeno` (US-19): al volver del detalle (Atras o «← Volver al mapa»)
 * la pantalla reaparece con los mismos filtros y la misma vista, y quien
 * copia la direccion comparte la vista filtrada. El encuadre del mapa (centro
 * y zoom) no se guarda: cambia con cada gesto y no es un filtro.
 *
 * Los nombres de los parametros son los de la pantalla (`categoria`, como en
 * `/desempeno`), no los del API (`categoriaId`): la URL es para personas.
 */

/** US-12: el mapa o la lista de los mismos resultados. */
export type VistaResultados = 'mapa' | 'lista';

export interface EstadoDelMapa {
  filtros: FiltrosMapa;
  vista: VistaResultados;
}

/** Ruta del mapa publico. */
export const RUTA_MAPA = '/mapa';

function enteroPositivo(texto: string | null): number | null {
  if (!texto || !/^\d+$/.test(texto)) return null;
  const n = Number(texto);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

/**
 * Lee el estado de los parametros. Tolera una URL editada a mano: lo que no
 * es valido (un id que no es entero positivo, un estado que el mapa no
 * muestra, una fecha imposible) cuenta como «sin filtro» en vez de romper o
 * de mandarle al backend algo que respondera 400.
 */
export function leerEstadoDelMapa(params: { get(nombre: string): string | null }): EstadoDelMapa {
  const estado = params.get('estado');
  const desde = params.get('desde');
  const hasta = params.get('hasta');
  return {
    filtros: {
      distritoId: enteroPositivo(params.get('distrito')),
      categoriaId: enteroPositivo(params.get('categoria')),
      estado: estado && (ESTADOS_EN_MAPA as readonly string[]).includes(estado) ? estado : null,
      fechaDesde: esDiaValido(desde) ? desde : null,
      fechaHasta: esDiaValido(hasta) ? hasta : null,
    },
    vista: params.get('vista') === 'lista' ? 'lista' : 'mapa',
  };
}

/**
 * Query string del estado, sin `?`, en un orden fijo. Omite lo que esta en
 * su valor por defecto (sin filtros y vista Mapa da `''`): la URL del mapa
 * sin tocar sigue siendo `/mapa`.
 */
export function queryDelMapa({ filtros, vista }: EstadoDelMapa): string {
  const params = new URLSearchParams();
  if (filtros.distritoId != null) params.set('distrito', String(filtros.distritoId));
  if (filtros.categoriaId != null) params.set('categoria', String(filtros.categoriaId));
  if (filtros.estado) params.set('estado', filtros.estado);
  if (filtros.fechaDesde) params.set('desde', filtros.fechaDesde);
  if (filtros.fechaHasta) params.set('hasta', filtros.fechaHasta);
  if (vista !== 'mapa') params.set('vista', vista);
  return params.toString();
}

/** `/mapa` con el estado, o `/mapa` a secas si todo esta por defecto. */
export function rutaDelMapa(estado: EstadoDelMapa): string {
  const query = queryDelMapa(estado);
  return query ? `${RUTA_MAPA}?${query}` : RUTA_MAPA;
}

/**
 * Descarta los ids que el catalogo no conoce (una URL editada a mano, o un
 * tipo de daño que se desactivo): si no, el selector mostraria «Todos» y
 * el mapa estaria filtrando igual, sin que se viera por que. Mientras un
 * catalogo no cargo (`null`) no se toca su parte: todavia no se sabe que
 * es valido.
 */
export function depurarFiltros(
  filtros: FiltrosMapa,
  distritosConocidos: readonly number[] | null,
  categoriasConocidas: readonly number[] | null,
): FiltrosMapa {
  const fuera = (id: number | null, conocidos: readonly number[] | null) =>
    id != null && conocidos != null && !conocidos.includes(id);
  if (!fuera(filtros.distritoId, distritosConocidos) && !fuera(filtros.categoriaId, categoriasConocidas)) {
    return filtros;
  }
  return {
    ...filtros,
    distritoId: fuera(filtros.distritoId, distritosConocidos) ? null : filtros.distritoId,
    categoriaId: fuera(filtros.categoriaId, categoriasConocidas) ? null : filtros.categoriaId,
  };
}

/**
 * A donde lleva «← Volver al mapa» desde el detalle publico: el mapa con los
 * filtros y la vista con que se abrio el reporte (`?volver=` que agregan la
 * lista y el popup), o `/mapa` a secas.
 *
 * Solo se acepta una ruta interna (`destinoInterno`, el mismo filtro de
 * redireccion abierta del login) y solo si es el mapa: el parametro viaja en
 * la URL y cualquiera puede escribirlo.
 */
export function rutaDeRegresoAlMapa(volver: string | null | undefined): string {
  const destino = destinoInterno(volver, RUTA_MAPA);
  const ruta = destino.split(/[?#]/, 1)[0];
  return ruta === RUTA_MAPA ? destino : RUTA_MAPA;
}

/** Enlace al detalle publico que recuerda de que vista del mapa se vino. */
export function rutaDelDetalle(reporteId: number, regreso: string): string {
  return regreso === RUTA_MAPA
    ? `/reportes/${reporteId}`
    : `/reportes/${reporteId}?volver=${encodeURIComponent(regreso)}`;
}

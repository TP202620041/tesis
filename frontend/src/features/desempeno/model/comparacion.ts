import type { DesempenoDistrital } from './formato';

/**
 * US-19: comparacion de 2 a 4 distritos, con su estado en la URL.
 *
 * La URL es la unica fuente del estado (`?comparar=21,41&categoria=3`): asi
 * quien copia la direccion comparte la misma comparacion y el mismo filtro,
 * y el boton Atras del navegador no se mezcla con un estado local paralelo.
 */

export const MAX_COMPARAR = 4;
export const MIN_COMPARAR = 2;

export const AVISO_MAXIMO = `Puedes comparar hasta ${MAX_COMPARAR} distritos. Quita uno para agregar otro.`;

export interface EstadoComparacion {
  /** Ids de distrito en el orden en que se eligieron. */
  distritos: number[];
  categoriaId: number | null;
}

function enteroPositivo(texto: string | null | undefined): number | null {
  if (!texto || !/^\d+$/.test(texto.trim())) return null;
  const n = Number(texto.trim());
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

/**
 * Lee el estado de los parametros de la URL. Tolera una URL editada a mano:
 * descarta ids que no son enteros positivos y repetidos, y se queda con los
 * primeros {@link MAX_COMPARAR}.
 */
export function leerComparacion(params: { get(nombre: string): string | null }): EstadoComparacion {
  const distritos: number[] = [];
  for (const parte of (params.get('comparar') ?? '').split(',')) {
    const id = enteroPositivo(parte);
    if (id != null && !distritos.includes(id)) distritos.push(id);
    if (distritos.length === MAX_COMPARAR) break;
  }
  return { distritos, categoriaId: enteroPositivo(params.get('categoria')) };
}

/**
 * Descarta lo que la URL trae y el catalogo no conoce (una URL editada a
 * mano): un distrito inexistente no debe ocupar uno de los 4 lugares ni
 * mostrarse como «Distrito N», y un tipo de dano inexistente cuenta como
 * «Todos los tipos». Mientras un catalogo no cargo (`null`), no se toca esa
 * parte: no se sabe todavia que es valido.
 */
export function depurarComparacion(
  estado: EstadoComparacion,
  distritosConocidos: ReadonlyMap<number, string> | null,
  categoriasConocidas: readonly number[] | null,
): EstadoComparacion {
  return {
    distritos: distritosConocidos
      ? estado.distritos.filter((id) => distritosConocidos.has(id))
      : estado.distritos,
    categoriaId:
      categoriasConocidas && estado.categoriaId != null && !categoriasConocidas.includes(estado.categoriaId)
        ? null
        : estado.categoriaId,
  };
}

/** Query string del estado, sin `?`. Vacio si no hay nada que guardar. */
export function queryDeComparacion(estado: EstadoComparacion): string {
  const params = new URLSearchParams();
  // La coma se deja literal: la URL queda legible (`comparar=21,41`).
  const partes: string[] = [];
  if (estado.distritos.length > 0) partes.push(`comparar=${estado.distritos.join(',')}`);
  if (estado.categoriaId != null) params.set('categoria', String(estado.categoriaId));
  const resto = params.toString();
  if (resto) partes.push(resto);
  return partes.join('&');
}

export type ResultadoSeleccion =
  | { agregado: true; distritos: number[] }
  | { agregado: false; distritos: number[]; motivo: 'maximo' };

/**
 * Agrega un distrito a la comparacion. Con {@link MAX_COMPARAR} ya elegidos
 * no se agrega y se informa el motivo, para que la pantalla lo diga.
 */
export function agregarDistrito(distritos: number[], id: number): ResultadoSeleccion {
  if (distritos.includes(id)) return { agregado: true, distritos };
  if (distritos.length >= MAX_COMPARAR) return { agregado: false, distritos, motivo: 'maximo' };
  return { agregado: true, distritos: [...distritos, id] };
}

export function quitarDistrito(distritos: number[], id: number): number[] {
  return distritos.filter((d) => d !== id);
}

/** Una columna de la comparacion: la fila del indice, o `null` si no hay datos. */
export interface DistritoComparado {
  distritoId: number;
  nombre: string;
  /**
   * `null` cuando el indice no trae fila para ese distrito: con un tipo de
   * dano elegido, el backend solo devuelve los distritos con reportes de ese
   * tipo. No es un cero: ese distrito no participa de la metrica.
   */
  fila: DesempenoDistrital | null;
}

/**
 * Arma la comparacion en el orden en que se eligieron los distritos.
 * `nombres` viene del catalogo de distritos, porque un distrito sin fila
 * (filtrado por tipo de dano) igual debe mostrarse con su nombre.
 */
export function distritosComparados(
  seleccion: number[],
  filas: DesempenoDistrital[],
  nombres: ReadonlyMap<number, string> | null,
): DistritoComparado[] {
  return seleccion.map((id) => {
    const fila = filas.find((f) => f.distritoId === id) ?? null;
    return {
      distritoId: id,
      nombre: fila?.distritoNombre ?? nombres?.get(id) ?? `Distrito ${id}`,
      fila,
    };
  });
}

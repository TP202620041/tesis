/**
 * Paginación en el cliente de la vista de lista del mapa (US-12).
 *
 * La lista muestra los MISMOS reportes que el mapa (la última consulta del
 * área visible, hasta `MAXIMO_MARCADORES`), así que pagina sobre lo que ya
 * se trajo en vez de hacer otra consulta: lista y mapa no pueden
 * contradecirse. Puro.
 */

export const TAMANO_PAGINA_LISTA = 20;

export interface Pagina<T> {
  elementos: T[];
  /** Índice de la página mostrada, desde 0 y ya acotado al rango válido. */
  pagina: number;
  /** Al menos 1, aunque no haya elementos. */
  totalPaginas: number;
  /** Posición (desde 1) del primer elemento mostrado; 0 si no hay ninguno. */
  desde: number;
  /** Posición del último elemento mostrado. */
  hasta: number;
  total: number;
}

/**
 * La página `pagina` de `items`. Si los resultados se achican (otro filtro,
 * otra área) y la página pedida ya no existe, devuelve la última que sí.
 */
export function paginar<T>(
  items: readonly T[],
  pagina: number,
  tamano: number = TAMANO_PAGINA_LISTA,
): Pagina<T> {
  const total = items.length;
  const totalPaginas = Math.max(1, Math.ceil(total / tamano));
  const vigente = Math.min(Math.max(0, Math.trunc(pagina) || 0), totalPaginas - 1);
  const inicio = vigente * tamano;
  const elementos = items.slice(inicio, inicio + tamano);
  return {
    elementos,
    pagina: vigente,
    totalPaginas,
    desde: elementos.length > 0 ? inicio + 1 : 0,
    hasta: inicio + elementos.length,
    total,
  };
}

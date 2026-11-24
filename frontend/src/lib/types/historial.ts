import type { HistorialEntrada } from './domain';

/**
 * US-22 Esc. 2: el historial de un reporte empieza con su creación.
 *
 * El backend no guarda un evento de creación en `historial_estado_reporte`
 * (solo cambios de estado, asignaciones y moderación), así que un reporte que
 * sigue en Pendiente tenía la línea de tiempo vacía. Aquí se deriva ese
 * primer evento de la fecha de creación del reporte (`createdAt`), que todos
 * los detalles ya reciben.
 *
 * **Preparado para cuando el backend lo entregue.** Si alguna entrada trae un
 * tipo de evento de creación ({@link TIPOS_EVENTO_CREACION}), no se deriva
 * nada: manda el del servidor y no aparece dos veces. El nombre `CREACION` es
 * provisional: si el backend elige otro, se agrega a la lista.
 *
 * Puro: sin React ni I/O.
 */
export const TIPO_EVENTO_CREACION = 'CREACION';

/** Tipos de evento que cuentan como la creación del reporte. */
export const TIPOS_EVENTO_CREACION: readonly string[] = [TIPO_EVENTO_CREACION];

export function esEventoDeCreacion(entrada: HistorialEntrada): boolean {
  return entrada.tipoEvento != null && TIPOS_EVENTO_CREACION.includes(entrada.tipoEvento);
}

/**
 * Las entradas con el evento de creación al principio (el historial llega
 * en orden cronológico ascendente). Sin `creadoEn` válido, o si el servidor
 * ya trae el evento, devuelve las entradas tal cual.
 *
 * El evento derivado no tiene `id` (no es una fila del servidor) ni autor: el
 * ciudadano no ve quién hizo cada cosa en otras filas y aquí sería él mismo.
 */
export function conEventoDeCreacion(
  entradas: readonly HistorialEntrada[],
  creadoEn: string | null | undefined,
): HistorialEntrada[] {
  if (entradas.some(esEventoDeCreacion)) return [...entradas];
  if (!creadoEn || Number.isNaN(new Date(creadoEn).getTime())) return [...entradas];
  return [{ tipoEvento: TIPO_EVENTO_CREACION, fecha: creadoEn }, ...entradas];
}

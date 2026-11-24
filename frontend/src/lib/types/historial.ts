import type { HistorialEntrada } from './domain';

/**
 * US-22 Esc. 2: el historial de un reporte empieza con su creación.
 *
 * El backend entrega ese evento como primera entrada del historial
 * (`tipoEvento = 'CREACION'`, `id` y `autor` nulos; handoff
 * `2026-11-23-cierre-mvp-backend.md`). Si alguna entrada lo trae
 * ({@link TIPOS_EVENTO_CREACION}), no se deriva nada: manda el del servidor y
 * no aparece dos veces.
 *
 * **Respaldo para un backend anterior**, que no lo enviaba y dejaba vacía la
 * línea de tiempo de un reporte en Pendiente: se deriva de la fecha de
 * creación del reporte (`createdAt`), que todos los detalles ya reciben.
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

/*
 * NC-10c (decision del usuario del 29/10): retroceso progresivo de la cola
 * de US-06 tras el 503 `MODERACION_NO_DISPONIBLE`. Regla pura: el hook
 * guarda el estado y pasa la hora.
 *
 * Solo afecta a los reportes CON foto (los unicos que pasan por la
 * moderacion de la imagen): cada intento vuelve a subir la foto, asi que
 * mientras el servicio siga caido se espera 30 s, 1 min, 2 min, 4 min,
 * 8 min y luego 10 min (tope) entre intentos. Sin conexion, otros 5xx y los
 * reportes sin foto siguen el ritmo normal de la cola.
 */

/** Primera espera tras un 503 de la moderacion (ms). */
export const PRIMERA_ESPERA_DE_MODERACION = 30_000;
/** Tope de la espera entre intentos con foto (ms). */
export const ESPERA_MAXIMA_DE_MODERACION = 600_000;

/** Fallos seguidos de la moderacion y desde cuando se puede volver a intentar. */
export interface EsperaDeModeracion {
  fallosSeguidos: number;
  /** Epoch en ms. */
  reintentarDesde: number;
}

/** Espera tras `fallosSeguidos` (>= 1) 503 seguidos: 30 s, 1, 2, 4, 8 y 10 min. */
export function esperaTrasFallos(fallosSeguidos: number): number {
  const n = Math.max(1, Math.floor(fallosSeguidos));
  // Se acota el exponente para no desbordar con muchos fallos.
  const espera = PRIMERA_ESPERA_DE_MODERACION * 2 ** Math.min(n - 1, 10);
  return Math.min(espera, ESPERA_MAXIMA_DE_MODERACION);
}

/** Estado tras otro 503 de la moderacion a la hora `ahora`. */
export function trasModeracionNoDisponible(
  previa: EsperaDeModeracion | null,
  ahora: Date,
): EsperaDeModeracion {
  const fallosSeguidos = (previa?.fallosSeguidos ?? 0) + 1;
  return { fallosSeguidos, reintentarDesde: ahora.getTime() + esperaTrasFallos(fallosSeguidos) };
}

/** Si a la hora `ahora` se puede volver a enviar un reporte con foto. */
export function puedeEnviarConFoto(espera: EsperaDeModeracion | null, ahora: Date): boolean {
  return espera === null || ahora.getTime() >= espera.reintentarDesde;
}

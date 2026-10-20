/**
 * Filtros por fecha con semántica de **día local** (US-12, US-13, US-28).
 *
 * `<input type="date">` entrega un día `AAAA-MM-DD` sin zona horaria, y el
 * backend espera instantes (`Instant`, ISO 8601 en UTC). La conversión se
 * hace en la zona del navegador: «desde» es las 00:00 de ese día y «hasta»
 * incluye el día completo (23:59:59.999), porque quien filtra «hasta el 5»
 * espera ver lo reportado el 5. La usan la bandeja (exportación) y el mapa
 * público, para que un mismo rango signifique lo mismo en las dos pantallas.
 *
 * Puro: sin React ni I/O.
 */

const FORMATO_DIA = /^\d{4}-\d{2}-\d{2}$/;

/** `true` si `dia` es un `AAAA-MM-DD` que corresponde a una fecha real. */
export function esDiaValido(dia: string | null | undefined): dia is string {
  if (!dia || !FORMATO_DIA.test(dia)) return false;
  const fecha = new Date(`${dia}T00:00:00`);
  // `new Date` acepta el 31 de febrero y lo corre a marzo: se compara de vuelta.
  return (
    !Number.isNaN(fecha.getTime()) &&
    fecha.getFullYear() === Number(dia.slice(0, 4)) &&
    fecha.getMonth() + 1 === Number(dia.slice(5, 7)) &&
    fecha.getDate() === Number(dia.slice(8, 10))
  );
}

/** Instante ISO de las 00:00:00.000 locales del día. */
export function inicioDelDiaLocal(dia: string): string {
  return new Date(`${dia}T00:00:00`).toISOString();
}

/** Instante ISO de las 23:59:59.999 locales del día (incluye el día completo). */
export function finDelDiaLocal(dia: string): string {
  return new Date(`${dia}T23:59:59.999`).toISOString();
}

/**
 * `true` si los dos extremos están puestos y «desde» es posterior a «hasta».
 * Con el formato `AAAA-MM-DD` el orden de texto es el orden cronológico.
 */
export function rangoDeDiasInvertido(
  desde: string | null | undefined,
  hasta: string | null | undefined,
): boolean {
  return esDiaValido(desde) && esDiaValido(hasta) && desde > hasta;
}

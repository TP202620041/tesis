/**
 * NC-02: reglas puras del titulo de un reporte, iguales a las del backend
 * (`Reporte.normalizarTitulo` y el `CHECK` de V17): obligatorio, de
 * {@link TITULO_MINIMO} a {@link TITULO_MAXIMO} caracteres despues de quitar
 * los espacios del borde. El backend guarda y devuelve el titulo recortado.
 *
 * Se cuentan code points, no unidades UTF-16: para el backend un emoji es 1
 * caracter y para `'😀'.length` son 2. Por eso `[...texto]` y no `.length`
 * (y por eso el `<input>` no lleva `maxLength`, que cuenta UTF-16).
 */

export const TITULO_MINIMO = 5;
export const TITULO_MAXIMO = 120;

/** Largo del titulo como lo cuenta el backend: code points, sin los espacios del borde. */
export function largoDelTitulo(titulo: string): number {
  return [...titulo.trim()].length;
}

/** Mensaje de error del titulo, o `null` si es valido. */
export function errorDelTitulo(titulo: string | null | undefined): string | null {
  const largo = largoDelTitulo(titulo ?? '');
  if (largo === 0) return 'Escribe un título para el reporte.';
  if (largo < TITULO_MINIMO) {
    return `El título debe tener al menos ${TITULO_MINIMO} caracteres.`;
  }
  if (largo > TITULO_MAXIMO) {
    return `El título debe tener como máximo ${TITULO_MAXIMO} caracteres.`;
  }
  return null;
}

export function esTituloValido(titulo: string | null | undefined): boolean {
  return errorDelTitulo(titulo) === null;
}

/**
 * Titulo sugerido «<categoría> en <distrito>», el mismo formato con que la
 * migracion V17 relleno los reportes existentes. Vacio si falta alguno de
 * los dos o si el resultado no seria un titulo valido: la sugerencia nunca
 * reemplaza la decision del ciudadano, que igual tiene que confirmarlo.
 */
export function tituloSugerido(
  categoria: string | null | undefined,
  distrito: string | null | undefined,
): string {
  const c = categoria?.trim();
  const d = distrito?.trim();
  if (!c || !d) return '';
  const sugerido = `${c} en ${d}`;
  return esTituloValido(sugerido) ? sugerido : '';
}

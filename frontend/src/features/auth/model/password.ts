/**
 * Reglas de la contraseña, compartidas por el registro (US-01) y el
 * restablecimiento (US-03).
 *
 * Replican el `@Size(min = 8, max = 72)` de `RegistroRequest` y
 * `RestablecerPasswordRequest` en el backend, que sigue siendo la autoridad:
 * aquí solo sirven para avisar antes de enviar. El máximo de 72 no es
 * arbitrario: BCrypt ignora lo que pasa de 72 bytes.
 */
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 72;

/** Ayuda que se muestra bajo el campo ANTES de enviar (QA-1 M-2). */
export const AYUDA_PASSWORD = `Mínimo ${PASSWORD_MIN} caracteres.`;

/**
 * Error de largo de una contraseña, o `null` si cumple. QA-1 M-2: el registro
 * la valida antes de enviar; si no, el backend respondia «Error de validacion
 * / password: el tamaño debe estar entre 8 y 72», con el campo en ingles.
 */
export function errorDeLargoDePassword(password: string): string | null {
  if (password.length < PASSWORD_MIN) {
    return `La contraseña debe tener al menos ${PASSWORD_MIN} caracteres.`;
  }
  if (password.length > PASSWORD_MAX) {
    return `La contraseña no puede tener más de ${PASSWORD_MAX} caracteres.`;
  }
  return null;
}

/**
 * Errores de la contraseña nueva y su confirmación, en el orden en que se
 * muestran. Lista vacía = se puede enviar.
 */
export function erroresDePasswordNueva(password: string, confirmacion: string): string[] {
  const errores: string[] = [];
  const largo = errorDeLargoDePassword(password);
  if (largo) errores.push(largo);
  if (password !== confirmacion) {
    errores.push('Las contraseñas no coinciden.');
  }
  return errores;
}

/**
 * El token llega por correo y se copia a mano: se quitan los espacios y
 * saltos de línea que suelen colarse al copiar, que de otro modo darían un
 * 404 ("token inválido") confuso.
 */
export function normalizarToken(token: string): string {
  return token.replace(/\s+/g, '');
}

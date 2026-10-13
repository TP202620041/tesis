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

/**
 * Errores de la contraseña nueva y su confirmación, en el orden en que se
 * muestran. Lista vacía = se puede enviar.
 */
export function erroresDePasswordNueva(password: string, confirmacion: string): string[] {
  const errores: string[] = [];
  if (password.length < PASSWORD_MIN) {
    errores.push(`La contraseña debe tener al menos ${PASSWORD_MIN} caracteres.`);
  }
  if (password.length > PASSWORD_MAX) {
    errores.push(`La contraseña no puede tener más de ${PASSWORD_MAX} caracteres.`);
  }
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

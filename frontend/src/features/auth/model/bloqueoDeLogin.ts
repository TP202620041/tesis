/**
 * US-02 Esc. 2: bloqueo temporal del inicio de sesión.
 *
 * Tras 5 intentos fallidos seguidos el backend responde **409**
 * `LOGIN_BLOQUEADO` durante 15 minutos, también con la contraseña correcta
 * y también para un correo sin cuenta (handoff
 * `2026-11-23-cierre-mvp-backend.md`): así el bloqueo no revela si el correo
 * existe. La PWA muestra el mensaje del servidor tal cual; este respaldo
 * solo se usa si llegara vacío, y tampoco distingue cuentas.
 *
 * Puro: sin React ni I/O.
 */
export const CODIGO_LOGIN_BLOQUEADO = 'LOGIN_BLOQUEADO';

export const TITULO_LOGIN_BLOQUEADO = 'Inicio de sesión bloqueado temporalmente';

export const MENSAJE_LOGIN_BLOQUEADO =
  'Demasiados intentos fallidos. Por seguridad, vuelve a intentarlo en 15 minutos.';

export function esLoginBloqueado(status: number, codigo: string | null | undefined): boolean {
  return status === 409 && codigo === CODIGO_LOGIN_BLOQUEADO;
}

/** El mensaje del servidor; el de respaldo si vino vacío. */
export function mensajeDeLoginBloqueado(delServidor: string | null | undefined): string {
  return delServidor && delServidor.trim() ? delServidor : MENSAJE_LOGIN_BLOQUEADO;
}

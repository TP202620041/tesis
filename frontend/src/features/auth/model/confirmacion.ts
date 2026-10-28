/**
 * Confirmación del correo al crear la cuenta (NC-09). Reglas puras: qué
 * significa cada `codigo` del backend, cuándo un enlace se puede mandar al
 * API y cuánto falta para poder pedir otro.
 *
 * Contrato: `project-context/handoffs/2026-10-28-confirmacion-correo.md`.
 * Todas las decisiones se toman por `codigo` (o por el status), nunca por el
 * texto del mensaje, que se muestra tal cual.
 */

/** Login (409): la contraseña es correcta pero la cuenta no confirmó su correo. */
export const CODIGO_CORREO_NO_CONFIRMADO = 'CORREO_NO_CONFIRMADO';

/**
 * Registro (409): el dominio del correo no sirve. Van en línea en el campo
 * del correo, no como error general del formulario.
 */
export const CODIGOS_CORREO_RECHAZADO: readonly string[] = ['CORREO_DESECHABLE', 'DOMINIO_SIN_CORREO'];

/** Confirmación (409): resultado del enlace. */
export const CODIGO_CORREO_YA_CONFIRMADO = 'CORREO_YA_CONFIRMADO';
export const CODIGO_CONFIRMACION_VENCIDA = 'CONFIRMACION_VENCIDA';
export const CODIGO_CONFIRMACION_REEMPLAZADA = 'CONFIRMACION_REEMPLAZADA';
export const CODIGO_CONFIRMACION_INVALIDA = 'CONFIRMACION_INVALIDA';

/**
 * Largo máximo del token que acepta el backend (`@Size(max = 100)` de
 * `ConfirmarCorreoRequest`; uno real tiene 43). Más largo, o vacío, da 400:
 * la página lo resuelve sin llamar al API.
 */
export const TOKEN_CONFIRMACION_MAX = 100;

/**
 * Espera entre reenvíos, en segundos. El backend admite uno por minuto por
 * cuenta (el del registro cuenta) y responde 202 igual cuando no envía, así
 * que la PWA deshabilita el botón ese tiempo para no prometer un correo que
 * no saldrá.
 */
export const ESPERA_REENVIO_SEGUNDOS = 60;

/**
 * Texto tras pedir otro enlace. Siempre el mismo: el backend responde 202
 * exista o no la cuenta (no revela qué correos están registrados).
 */
export const MENSAJE_REENVIO =
  'Si tu cuenta está pendiente de confirmar, te enviamos un enlace nuevo. Revisa tu correo (y la carpeta de spam).';

/**
 * NC-09c: lo que suma «¿Olvidaste tu contraseña?» tras pedir el token. Desde
 * NC-09b el backend no envía nada a una cuenta sin confirmar (responde lo
 * mismo que para un correo sin cuenta), y sin esto quien no confirmó y
 * olvidó la contraseña no tiene salida. Se muestra **siempre**, haya o no
 * cuenta y esté o no confirmada, así que no revela nada.
 */
export const AVISO_RECUPERACION_SIN_CONFIRMAR =
  'Si todavía no confirmaste tu cuenta, no te llegará este correo: pide el enlace de confirmación.';

/**
 * Enlace sin token o con uno imposible: el mismo texto que el 409
 * `CONFIRMACION_INVALIDA`, porque para el usuario es el mismo problema.
 */
export const MENSAJE_ENLACE_INVALIDO =
  'El enlace de confirmación no es válido. Revisa que lo hayas copiado completo o pide uno nuevo desde el inicio de sesión.';

/**
 * Estado de la página `/confirmar-cuenta`.
 *
 * - `confirmando`: la petición está en curso.
 * - `confirmado`: 204, o 409 `CORREO_YA_CONFIRMADO` (un segundo clic, o el
 *   antivirus del correo que abrió el enlace antes): para el usuario es lo
 *   mismo, ya puede iniciar sesión.
 * - `vencido`, `reemplazado`, `invalido`: el enlace no sirve; se ofrece
 *   pedir otro.
 * - `error`: no hubo respuesta útil (red, 5xx); se puede reintentar.
 */
export type EstadoConfirmacion = 'confirmando' | 'confirmado' | 'vencido' | 'reemplazado' | 'invalido' | 'error';

/** `true` si el token puede mandarse al API (el backend rechaza vacío o largo con 400). */
export function tokenDeConfirmacionUsable(token: string | null | undefined): token is string {
  return typeof token === 'string' && token.trim() !== '' && token.length <= TOKEN_CONFIRMACION_MAX;
}

/** Estado que corresponde a una respuesta de error de `POST /api/auth/confirmar-correo`. */
export function estadoTrasErrorDeConfirmacion(
  status: number,
  codigo: string | null,
): Exclude<EstadoConfirmacion, 'confirmando'> {
  if (status === 400) return 'invalido';
  if (status !== 409) return 'error';
  switch (codigo) {
    case CODIGO_CORREO_YA_CONFIRMADO:
      return 'confirmado';
    case CODIGO_CONFIRMACION_VENCIDA:
      return 'vencido';
    case CODIGO_CONFIRMACION_REEMPLAZADA:
      return 'reemplazado';
    case CODIGO_CONFIRMACION_INVALIDA:
      return 'invalido';
    default:
      return 'error';
  }
}

/** `true` si en ese estado tiene sentido pedir un enlace nuevo. */
export function permiteReenviar(estado: EstadoConfirmacion): boolean {
  return estado === 'vencido' || estado === 'reemplazado' || estado === 'invalido';
}

/** `true` si el error del registro es del dominio del correo (va en el campo). */
export function esCorreoRechazado(status: number, codigo: string | null): boolean {
  return status === 409 && codigo !== null && CODIGOS_CORREO_RECHAZADO.includes(codigo);
}

/** `true` si el login falló solo porque falta confirmar el correo. */
export function esCorreoSinConfirmar(status: number, codigo: string | null): boolean {
  return status === 409 && codigo === CODIGO_CORREO_NO_CONFIRMADO;
}

/**
 * Segundos enteros que faltan para poder pedir otro enlace, o 0. `ultimoEnvio`
 * y `ahora` en milisegundos; `null` = no se envió nada desde esta pantalla.
 */
export function segundosParaReenviar(
  ultimoEnvio: number | null,
  ahora: number,
  esperaSegundos: number = ESPERA_REENVIO_SEGUNDOS,
): number {
  if (ultimoEnvio === null) return 0;
  const restante = esperaSegundos * 1000 - (ahora - ultimoEnvio);
  return restante > 0 ? Math.ceil(restante / 1000) : 0;
}

/** «24 horas», «1 hora». */
export function textoDeHoras(horas: number): string {
  return `${horas} ${horas === 1 ? 'hora' : 'horas'}`;
}

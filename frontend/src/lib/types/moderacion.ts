/**
 * NC-10c (D-15): lo que la PWA hace con los rechazos de la moderación del
 * backend (NC-10b). Contrato: `project-context/handoffs/2026-10-29-moderacion.md`.
 *
 * Vive en `lib/` porque lo usan dos features (ARCHITECTURE §5.3): `reportes`
 * (crear, editar, comentar) y `auth` (registro y perfil). Lo propio de crear
 * un reporte (la foto, el 503 y la cola) está en
 * `features/reportes/model/moderacion.ts`.
 *
 * Todas las decisiones se toman por `codigo` y por `details`, nunca por el
 * texto del mensaje, que se muestra tal cual: el backend ya lo escribe sin
 * repetir la palabra rechazada, y la PWA tampoco la repite ni tiene la lista.
 */

/** 400 al crear un reporte: la moderación rechazó la foto (`details: ["foto"]`). */
export const CODIGO_FOTO_NO_PERMITIDA = 'FOTO_NO_PERMITIDA';

/** 400: un texto tiene palabras no permitidas. `details[0]` es el campo. */
export const CODIGO_TEXTO_NO_PERMITIDO = 'TEXTO_NO_PERMITIDO';

/** 503 al crear un reporte CON foto: no se pudo moderar (falla cerrada). */
export const CODIGO_MODERACION_NO_DISPONIBLE = 'MODERACION_NO_DISPONIBLE';

/** Los campos de texto que modera el backend, con el nombre que llevan en el pedido. */
export const CAMPOS_DE_TEXTO_MODERADOS = [
  'titulo',
  'descripcion',
  'contenido',
  'nombre',
  'apellido',
] as const;

export type CampoDeTextoModerado = (typeof CAMPOS_DE_TEXTO_MODERADOS)[number];

export function esCampoDeTextoModerado(valor: unknown): valor is CampoDeTextoModerado {
  return (CAMPOS_DE_TEXTO_MODERADOS as readonly unknown[]).includes(valor);
}

/** Cómo se llama cada campo en una frase («El título tiene…»). */
export const NOMBRE_DEL_CAMPO: Readonly<Record<CampoDeTextoModerado, string>> = {
  titulo: 'El título',
  descripcion: 'La descripción',
  contenido: 'El comentario',
  nombre: 'El nombre',
  apellido: 'El apellido',
};

/**
 * Lo que la regla necesita de un error del API. Es la forma de `ApiError`
 * (`lib/api/errors.ts`), que el dominio no importa: el hook le pasa el error
 * tal cual.
 */
export interface ErrorDelApi {
  readonly status: number;
  readonly codigo: string | null;
  readonly details: readonly string[];
  readonly message: string;
}

/** Los códigos de la moderación, cuyos `details` son el campo y no un mensaje. */
export function esRechazoDeModeracion(codigo: string | null | undefined): boolean {
  return (
    codigo === CODIGO_FOTO_NO_PERMITIDA ||
    codigo === CODIGO_TEXTO_NO_PERMITIDO ||
    codigo === CODIGO_MODERACION_NO_DISPONIBLE
  );
}

/**
 * Un texto que el backend rechazó, con el valor que tenía el campo al
 * enviarlo. El error se muestra en ese campo mientras siga diciendo lo mismo
 * ({@link errorDelCampo}): en cuanto el ciudadano lo cambia, ya no se sabe si
 * el texto nuevo pasa, y lo dirá el próximo envío. Es la misma regla que el
 * correo rechazado del registro (NC-09).
 */
export interface TextoRechazado {
  campo: CampoDeTextoModerado;
  /** El mensaje del backend, que nunca repite la palabra. */
  mensaje: string;
  valor: string;
}

/**
 * El 400 `TEXTO_NO_PERMITIDO` de un formulario, o `null` si el error es otro.
 *
 * `valores` son los campos moderados que tiene ESE formulario, con lo que
 * se envió. Si `details[0]` no es uno de ellos (un campo que la pantalla no
 * tiene), también da `null`: el hook lo muestra entonces como error general,
 * con su mensaje, en vez de perderlo.
 */
export function textoRechazado(
  error: ErrorDelApi,
  valores: Partial<Record<CampoDeTextoModerado, string>>,
): TextoRechazado | null {
  if (error.status !== 400 || error.codigo !== CODIGO_TEXTO_NO_PERMITIDO) return null;
  const campo = error.details[0];
  if (!esCampoDeTextoModerado(campo)) return null;
  const valor = valores[campo];
  if (valor === undefined) return null;
  const mensaje = error.message.trim() || mensajeDeTextoNoPermitido(campo);
  return { campo, mensaje, valor };
}

/**
 * El error que va en `campo`, o `null`: solo si el rechazo fue de ese campo
 * y el ciudadano todavía no cambió lo que escribió.
 */
export function errorDelCampo(
  rechazo: TextoRechazado | null,
  campo: CampoDeTextoModerado,
  valorActual: string,
): string | null {
  if (!rechazo || rechazo.campo !== campo || rechazo.valor !== valorActual) return null;
  return rechazo.mensaje;
}

/**
 * El mensaje por campo si el backend lo mandara vacío (no debería: siempre
 * escribe uno). Es el mismo texto que el del backend.
 */
export function mensajeDeTextoNoPermitido(campo: CampoDeTextoModerado): string {
  const femenino = campo === 'descripcion';
  return `${NOMBRE_DEL_CAMPO[campo]} tiene palabras que no están permitidas. ${
    femenino ? 'Cámbiala' : 'Cámbialo'
  } para continuar.`;
}

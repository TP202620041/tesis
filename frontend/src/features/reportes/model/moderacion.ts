/**
 * NC-10c (D-15): la moderación del backend (NC-10b) al crear un reporte, en
 * la vista previa de la foto y en la cola sin conexión. Reglas puras, por
 * `codigo` y `details`, nunca por el texto. Lo que comparten `reportes` y
 * `auth` (los códigos y el texto rechazado por campo) está en
 * `lib/types/moderacion.ts`.
 *
 * Contrato: `project-context/handoffs/2026-10-29-moderacion.md`.
 */
import {
  CODIGO_FOTO_NO_PERMITIDA,
  CODIGO_MODERACION_NO_DISPONIBLE,
  CODIGO_TEXTO_NO_PERMITIDO,
  esCampoDeTextoModerado,
  NOMBRE_DEL_CAMPO,
  textoRechazado,
  type ErrorDelApi,
  type TextoRechazado,
} from '@/lib/types/moderacion';

/**
 * Junto a la foto, cuando la moderación la rechaza (400 `FOTO_NO_PERMITIDA`
 * al crear, o `fotoRechazada: true` en la vista previa). Texto fijo y no el
 * del backend: la vista previa no trae mensaje, y así se lee igual en los
 * dos casos.
 */
export const MENSAJE_FOTO_NO_PERMITIDA = 'La foto no está permitida. Toma otra.';

/** Si el 503 llegara sin mensaje (el backend siempre manda uno). */
export const MENSAJE_MODERACION_NO_DISPONIBLE =
  'No pudimos revisar la foto en este momento. Guarda el reporte para enviarlo después o envíalo sin foto.';

/** Las dos salidas que ofrece el formulario ante el 503 de la moderación. */
export const ACCION_GUARDAR_PARA_DESPUES = 'Guardar para enviar después';
export const ACCION_ENVIAR_SIN_FOTO = 'Enviar sin foto';

/** Los campos moderados del formulario de creación y de la edición. */
export interface TextosDelReporte {
  titulo: string;
  descripcion: string;
}

/** 400 `FOTO_NO_PERMITIDA`: la moderación rechazó la foto del reporte. */
export function esFotoNoPermitida(error: Pick<ErrorDelApi, 'status' | 'codigo'>): boolean {
  return error.status === 400 && error.codigo === CODIGO_FOTO_NO_PERMITIDA;
}

/**
 * 503 `MODERACION_NO_DISPONIBLE`: no se pudo moderar la foto (falla
 * cerrada). Solo este 503 lleva `codigo`: el de un almacenamiento caído o sin
 * turno para sanear (DEP-11/12) no lo lleva y sigue siendo un error común.
 */
export function esModeracionNoDisponible(error: Pick<ErrorDelApi, 'status' | 'codigo'>): boolean {
  return error.status === 503 && error.codigo === CODIGO_MODERACION_NO_DISPONIBLE;
}

/** Qué hace el formulario de creación con un rechazo de la moderación. */
export type RechazoAlCrear =
  /** Quita la foto, avisa junto a ella y conserva el resto. */
  | { tipo: 'foto-no-permitida' }
  /** El error va en el campo (`titulo` o `descripcion`). */
  | { tipo: 'texto-no-permitido'; texto: TextoRechazado }
  /** Ofrece «Guardar para enviar después» y «Enviar sin foto». */
  | { tipo: 'moderacion-no-disponible'; mensaje: string };

/**
 * El rechazo de la moderación al crear un reporte, o `null` si el error es
 * otro (y se muestra como hasta ahora). `textos` son el título y la
 * descripción tal como se enviaron.
 */
export function rechazoAlCrear(error: ErrorDelApi, textos: TextosDelReporte): RechazoAlCrear | null {
  if (esFotoNoPermitida(error)) return { tipo: 'foto-no-permitida' };
  if (esModeracionNoDisponible(error)) {
    return {
      tipo: 'moderacion-no-disponible',
      mensaje: error.message.trim() || MENSAJE_MODERACION_NO_DISPONIBLE,
    };
  }
  const texto = textoRechazado(error, { titulo: textos.titulo, descripcion: textos.descripcion });
  return texto ? { tipo: 'texto-no-permitido', texto } : null;
}

/**
 * El motivo que queda en la cola sin conexión (US-06) cuando el reenvío de
 * un reporte recibe un rechazo de la moderación. Como cualquier 4xx, queda
 * `rechazado` y no se reintenta; el ciudadano solo puede descartarlo, así que
 * el motivo dice eso en vez de «Toma otra» o «Cámbiala», que en la cola no se
 * pueden hacer. Para cualquier otro error, el mensaje del backend tal cual.
 */
export function motivoDeRechazoEnLaCola(error: ErrorDelApi): string {
  if (esFotoNoPermitida(error)) {
    return 'La foto no está permitida. Descártalo y vuelve a reportar el daño con otra foto o sin ella.';
  }
  const campo = error.details[0];
  if (error.status === 400 && error.codigo === CODIGO_TEXTO_NO_PERMITIDO && esCampoDeTextoModerado(campo)) {
    return `${NOMBRE_DEL_CAMPO[campo]} tiene palabras que no están permitidas. Descártalo y vuelve a reportar el daño sin ellas.`;
  }
  return error.message;
}

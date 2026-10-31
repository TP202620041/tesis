/**
 * NC-11b (D-15): la denuncia de un reporte publicado por un CIUDADANO
 * (`POST /api/reportes/{id}/denuncias`). Reglas puras: motivos, limites y la
 * traduccion de los errores del backend, por `codigo` y nunca por el texto.
 * Contrato: `project-context/handoffs/2026-10-29-ocultar-y-denunciar.md`.
 *
 * El backend es la autoridad (una denuncia por reporte, 10 por dia, nunca
 * sobre el propio reporte); aqui solo se decide que decirle al ciudadano.
 */
import { MOTIVOS_DENUNCIA, type MotivoDenuncia } from '@/lib/types/domain';
import type { ErrorDelApi } from '@/lib/types/moderacion';

/** `DenunciarReporteRequest.detalle`: `@Size(max = 500)`. */
export const MAX_DETALLE_DENUNCIA = 500;

/** 409: el ciudadano ya denuncio este reporte. */
export const CODIGO_DENUNCIA_REPETIDA = 'DENUNCIA_REPETIDA';
/** 409: 10 denuncias en las ultimas 24 h. */
export const CODIGO_LIMITE_DENUNCIAS = 'LIMITE_DENUNCIAS';
/** 409: el reporte es del propio ciudadano. */
export const CODIGO_DENUNCIA_PROPIA = 'DENUNCIA_PROPIA';

/** Como se presenta cada motivo al elegirlo (y en la bandeja del ADMIN). */
export const ETIQUETA_DE_MOTIVO: Readonly<Record<MotivoDenuncia, string>> = {
  CONTENIDO_SEXUAL: 'Contenido sexual',
  OFENSIVO: 'Contenido ofensivo',
  DATOS_PERSONALES: 'Muestra datos personales',
  FALSO: 'Es falso o no es un daño vial',
  OTRO: 'Otro motivo',
};

export function etiquetaDeMotivo(motivo: string): string {
  return (ETIQUETA_DE_MOTIVO as Record<string, string>)[motivo] ?? motivo;
}

/** Los motivos en el orden en que se ofrecen. */
export const MOTIVOS_PARA_DENUNCIAR: readonly MotivoDenuncia[] = MOTIVOS_DENUNCIA;

/** Lo que el ciudadano eligio y escribio antes de enviar. */
export interface BorradorDeDenuncia {
  motivo: MotivoDenuncia | null;
  detalle: string;
}

/** Errores del formulario; vacio = se puede enviar. */
export function erroresDeDenuncia({ motivo, detalle }: BorradorDeDenuncia): string[] {
  const errores: string[] = [];
  if (!motivo) errores.push('Elige el motivo de la denuncia.');
  if (detalle.trim().length > MAX_DETALLE_DENUNCIA) {
    errores.push(`El detalle admite hasta ${MAX_DETALLE_DENUNCIA} caracteres.`);
  }
  return errores;
}

/** Textos fijos del dialogo de denuncia. */
export const TEXTOS_DENUNCIA = {
  boton: 'Denunciar contenido',
  titulo: 'Denunciar este reporte',
  explicacion:
    'Cuéntanos qué está mal en este reporte. El equipo de Ciudad Viva lo revisará; quien lo envió no sabrá quién lo denunció.',
  gracias: 'Gracias. Recibimos tu denuncia y la revisaremos.',
  sinSesion: 'Inicia sesión para denunciar contenido',
  repetida: 'Ya denunciaste este reporte',
  limite: 'Alcanzaste el máximo de denuncias por hoy',
  propia: 'No puedes denunciar tu propio reporte',
  noDisponible: 'Este reporte ya no está disponible.',
} as const;

/**
 * Mensaje para el ciudadano a partir del error del POST. Los 409 se deciden
 * por `codigo`, con el texto del contrato (el backend manda el mismo); el
 * 404 es un reporte retirado u oculto mientras lo miraba. Devuelve `null` si
 * no es uno de estos: el hook lo muestra entonces con `mensajeDeError`.
 */
export function mensajeDeDenunciaRechazada(error: ErrorDelApi): string | null {
  if (error.status === 409) {
    switch (error.codigo) {
      case CODIGO_DENUNCIA_REPETIDA:
        return TEXTOS_DENUNCIA.repetida;
      case CODIGO_LIMITE_DENUNCIAS:
        return TEXTOS_DENUNCIA.limite;
      case CODIGO_DENUNCIA_PROPIA:
        return TEXTOS_DENUNCIA.propia;
      default:
        return error.message.trim() || null;
    }
  }
  if (error.status === 404) return TEXTOS_DENUNCIA.noDisponible;
  return null;
}

/**
 * `true` si el 409 dice que el ciudadano ya denuncio o que no puede (es su
 * reporte): el dialogo no ofrece reintentar, solo cerrar.
 */
export function esDenunciaDefinitiva(error: ErrorDelApi): boolean {
  return (
    error.status === 409 &&
    (error.codigo === CODIGO_DENUNCIA_REPETIDA || error.codigo === CODIGO_DENUNCIA_PROPIA)
  );
}

/**
 * Reglas puras de la moderacion del ADMIN (NC-11b, D-15): la bandeja y sus
 * vistas, el motivo de ocultar o restablecer, los avisos del dialogo y la
 * traduccion de los errores del backend por `codigo`, nunca por el texto.
 * Contrato: `project-context/handoffs/2026-10-29-ocultar-y-denunciar.md`.
 *
 * El backend es la autoridad: aqui solo se evita ofrecer lo que va a fallar
 * y se decide que decir.
 */
import {
  esEstadoDenuncia,
  ESTADOS_DENUNCIA,
  type AlcanceModeracion,
  type EstadoDenuncia,
} from '@/lib/types/domain';
import type { ErrorDelApi } from '@/lib/types/moderacion';
import type {
  AccionDeModeracion,
  Denuncia,
  FiltrosDeModeracion,
  PaginaDeModeracion,
  Visibilidad,
  VistaDeBandeja,
} from './tipos';

/* -------------------------------------------------------------------------
 * Bandeja
 * ---------------------------------------------------------------------- */

/** Tamaño de pagina de la bandeja (el `@PageableDefault` del backend es 20). */
export const TAMANO_PAGINA_MODERACION = 20;

/** Las vistas en el orden en que se ofrecen: los tres estados y «Ocultos». */
export const VISTAS_DE_BANDEJA: readonly VistaDeBandeja[] = [...ESTADOS_DENUNCIA, 'OCULTOS'];

export const FILTROS_MODERACION_INICIALES: FiltrosDeModeracion = { vista: 'PENDIENTE', pagina: 0 };

export function esVistaDeBandeja(valor: unknown): valor is VistaDeBandeja {
  return valor === 'OCULTOS' || esEstadoDenuncia(valor);
}

export function etiquetaDeVista(vista: VistaDeBandeja): string {
  switch (vista) {
    case 'PENDIENTE':
      return 'Denuncias pendientes';
    case 'ATENDIDA':
      return 'Denuncias atendidas';
    case 'DESESTIMADA':
      return 'Denuncias desestimadas';
    case 'OCULTOS':
      return 'Ocultos';
  }
}

/** Lo que lista cada vista, para el texto bajo el filtro. */
export function descripcionDeVista(vista: VistaDeBandeja): string {
  switch (vista) {
    case 'PENDIENTE':
      return 'Reportes con denuncias que todavía nadie revisó, el más denunciado recientemente primero.';
    case 'ATENDIDA':
      return 'Reportes cuyas denuncias terminaron en ocultar el reporte o su foto.';
    case 'DESESTIMADA':
      return 'Reportes cuyas denuncias se desestimaron sin ocultar nada.';
    case 'OCULTOS':
      return 'Reportes con el reporte o la foto ocultos, tengan denuncias o no, del ocultamiento más reciente al más antiguo.';
  }
}

/**
 * Query de `GET /api/admin/moderacion/reportes`. Con «Ocultos» va
 * `ocultos=true` y no `estado` (el backend lo ignoraria); con un estado, solo
 * `estado`.
 */
export function parametrosDeBandeja(
  filtros: FiltrosDeModeracion,
  tamano: number = TAMANO_PAGINA_MODERACION,
): URLSearchParams {
  const params = new URLSearchParams();
  if (filtros.vista === 'OCULTOS') params.set('ocultos', 'true');
  else params.set('estado', filtros.vista);
  params.set('page', String(Math.max(0, Math.trunc(filtros.pagina) || 0)));
  params.set('size', String(tamano));
  return params;
}

/** Cambiar la vista vuelve a la primera pagina. */
export function conVista(filtros: FiltrosDeModeracion, vista: VistaDeBandeja): FiltrosDeModeracion {
  return { ...filtros, vista, pagina: 0 };
}

/** Texto «Página X de Y» y si hay anterior/siguiente. */
export function navegacionDe(pagina: PaginaDeModeracion) {
  return {
    texto: `Página ${pagina.pagina + 1} de ${pagina.totalPaginas}`,
    hayAnterior: pagina.pagina > 0,
    haySiguiente: pagina.pagina + 1 < pagina.totalPaginas,
  };
}

/* -------------------------------------------------------------------------
 * Denuncias y visibilidad
 * ---------------------------------------------------------------------- */

export function etiquetaDeEstadoDenuncia(estado: EstadoDenuncia): string {
  switch (estado) {
    case 'PENDIENTE':
      return 'Pendiente';
    case 'ATENDIDA':
      return 'Atendida';
    case 'DESESTIMADA':
      return 'Desestimada';
  }
}

/** Clases de la etiqueta de estado de una denuncia (texto + fondo, legibles en ambos temas). */
export function claseDeEstadoDenuncia(estado: EstadoDenuncia): string {
  switch (estado) {
    case 'PENDIENTE':
      return 'border border-aviso-borde bg-aviso-fondo text-aviso-texto';
    case 'ATENDIDA':
      return 'border border-info-borde bg-info-fondo text-info-texto';
    case 'DESESTIMADA':
      return 'border border-linea bg-superficie-2 text-texto';
  }
}

export function hayDenunciasPendientes(denuncias: readonly Denuncia[]): boolean {
  return denuncias.some((d) => d.estado === 'PENDIENTE');
}

/** Que esta oculto, para decirlo en la bandeja y en el detalle; vacio = todo visible. */
export function etiquetasDeVisibilidad(v: Visibilidad): string[] {
  const etiquetas: string[] = [];
  if (v.oculto) etiquetas.push('Reporte oculto');
  if (v.fotoOculta) etiquetas.push('Foto oculta');
  return etiquetas;
}

/**
 * Que puede hacer el ADMIN con el reporte. El backend responde 409
 * (`YA_OCULTO`, `NO_OCULTO`, `SIN_FOTO`) a lo que no corresponde; aqui no se
 * ofrece.
 */
export interface AccionesDeModeracion {
  ocultarReporte: boolean;
  restablecerReporte: boolean;
  ocultarFoto: boolean;
  restablecerFoto: boolean;
  desestimar: boolean;
}

export function accionesDisponibles(reporte: Visibilidad & { denuncias: readonly Denuncia[] }): AccionesDeModeracion {
  return {
    ocultarReporte: !reporte.oculto,
    restablecerReporte: reporte.oculto,
    ocultarFoto: reporte.tieneFoto && !reporte.fotoOculta,
    restablecerFoto: reporte.tieneFoto && reporte.fotoOculta,
    desestimar: hayDenunciasPendientes(reporte.denuncias),
  };
}

/** Fecha y hora en `es-PE`; `—` si no vino o no es una fecha. */
export function fechaDeModeracion(iso: string | null | undefined): string {
  if (!iso) return '—';
  const fecha = new Date(iso);
  return Number.isNaN(fecha.getTime()) ? '—' : fecha.toLocaleString('es-PE');
}

/* -------------------------------------------------------------------------
 * Ocultar y restablecer
 * ---------------------------------------------------------------------- */

/** `ModerarContenidoRequest.motivo`: de 10 a 500 caracteres sin los espacios del borde. */
export const MIN_MOTIVO = 10;
export const MAX_MOTIVO = 500;

/** `DesestimarDenunciasRequest.motivo`: opcional, hasta 500. */
export const MAX_MOTIVO_DESESTIMACION = 500;

/**
 * Decision del usuario (30/10): va junto al motivo, en ocultar y en
 * restablecer. El motivo lo leen el creador y el funcionario; los terminos
 * v2 prometen que quien reporto no sabe quien lo denuncio.
 */
export const AVISO_MOTIVO =
  'El autor y la municipalidad leerán este motivo. No nombres a quien denunció ni digas cuántas denuncias hubo.';

export function tituloDeAccion(accion: AccionDeModeracion, alcance: AlcanceModeracion): string {
  const que = alcance === 'REPORTE' ? 'el reporte' : 'la foto';
  return `${accion === 'ocultar' ? 'Ocultar' : 'Restablecer'} ${que}`;
}

/** Lo que pasa con el indice de desempeño y la visibilidad, segun alcance y accion. */
export function avisoDeAlcance(accion: AccionDeModeracion, alcance: AlcanceModeracion): string {
  if (alcance === 'REPORTE') {
    return accion === 'ocultar'
      ? 'El reporte saldrá del mapa, del detalle público y de la bandeja municipal, y dejará de contar en el índice de desempeño del distrito. Su creador seguirá viéndolo en «Mis reportes», con este motivo.'
      : 'El reporte vuelve al mapa, al detalle público y a la bandeja municipal, y vuelve a contar en el índice de desempeño del distrito.';
  }
  return accion === 'ocultar'
    ? 'Solo se oculta la foto: el reporte sigue público y el índice de desempeño no cambia. La foto se conserva en privado y el ADMIN puede seguir viéndola aquí.'
    : 'La foto vuelve a verse en el reporte. El índice de desempeño no cambia.';
}

/** Error del motivo antes de enviarlo, o `null` si cumple el largo. */
export function errorDeMotivo(motivo: string): string | null {
  const largo = motivo.trim().length;
  if (largo < MIN_MOTIVO || largo > MAX_MOTIVO) {
    return `El motivo debe tener entre ${MIN_MOTIVO} y ${MAX_MOTIVO} caracteres.`;
  }
  return null;
}

/** Error del motivo opcional de la desestimacion, o `null`. */
export function errorDeMotivoDeDesestimacion(motivo: string): string | null {
  return motivo.trim().length > MAX_MOTIVO_DESESTIMACION
    ? `El motivo admite hasta ${MAX_MOTIVO_DESESTIMACION} caracteres.`
    : null;
}

/** 409 al ocultar lo que ya esta oculto. */
export const CODIGO_YA_OCULTO = 'YA_OCULTO';
/** 409 al restablecer lo que no esta oculto. */
export const CODIGO_NO_OCULTO = 'NO_OCULTO';
/** 409 con alcance `FOTO` en un reporte sin foto. */
export const CODIGO_SIN_FOTO = 'SIN_FOTO';
/** 400: el motivo contiene el correo de quien denuncio (`details: ["motivo"]`). */
export const CODIGO_MOTIVO_IDENTIFICA_DENUNCIANTE = 'MOTIVO_IDENTIFICA_DENUNCIANTE';

/** Donde va el error de una accion de moderacion. */
export type ErrorDeModeracion =
  /** En el campo del motivo (lo que escribio el ADMIN no sirve). */
  | { campo: 'motivo'; mensaje: string }
  /** Arriba del formulario: el estado del reporte ya no es el que se veia. */
  | { campo: null; mensaje: string; desactualizado: boolean };

const MENSAJE_POR_CODIGO: Readonly<Record<string, string>> = {
  [CODIGO_YA_OCULTO]: 'Ya está oculto.',
  [CODIGO_NO_OCULTO]: 'No está oculto.',
  [CODIGO_SIN_FOTO]: 'El reporte no tiene foto.',
};

/**
 * Traduce el error de ocultar, restablecer o desestimar. El 400
 * `MOTIVO_IDENTIFICA_DENUNCIANTE` (y cualquier 400 que señale `motivo` en
 * `details`) va en el campo; los 409 del estado (`YA_OCULTO`, `NO_OCULTO`,
 * `SIN_FOTO`) significan que otro ADMIN se adelanto o que lo que se veia
 * estaba viejo: se avisa y se recarga. Devuelve `null` si no es uno de
 * estos: el hook lo muestra con `mensajeDeError`.
 */
export function errorDeModeracion(error: ErrorDelApi): ErrorDeModeracion | null {
  const mensaje = error.message.trim();
  if (error.status === 400) {
    if (error.codigo === CODIGO_MOTIVO_IDENTIFICA_DENUNCIANTE || error.details.includes('motivo')) {
      return {
        campo: 'motivo',
        mensaje:
          mensaje ||
          'El motivo no puede incluir el correo de quien denunció: lo leerán el autor y la municipalidad',
      };
    }
    return null;
  }
  if (error.status === 409 && error.codigo && error.codigo in MENSAJE_POR_CODIGO) {
    return {
      campo: null,
      mensaje: mensaje || MENSAJE_POR_CODIGO[error.codigo]!,
      desactualizado: true,
    };
  }
  return null;
}

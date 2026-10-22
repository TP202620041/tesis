/**
 * Reglas puras de soporte (US-25): validación de formularios, parámetros de
 * la bandeja del ADMIN y presentación del estado.
 *
 * Los límites replican los `@Size` de `CrearTicketRequest` y
 * `ResponderTicketRequest`. El backend sigue siendo la autoridad (responde
 * 400); validar aquí solo evita un viaje que va a fallar.
 */
import { esEstadoTicket, type EstadoTicket } from '@/lib/types/domain';
import type { FiltrosTickets, NuevoTicket, PaginaTickets, RespuestaTicket } from './tipos';

export const MAX_ASUNTO = 200;
export const MAX_MENSAJE = 2000;
export const MAX_RESPUESTA = 2000;

/** Tamaño de página de la bandeja del ADMIN (el backend acepta 1..100). */
export const TAMANO_PAGINA_TICKETS = 20;

export const FILTROS_TICKETS_INICIALES: FiltrosTickets = { estado: null, pagina: 0 };

/** Errores del formulario de ticket; vacío = se puede enviar. */
export function erroresDeTicket({ asunto, mensaje }: NuevoTicket): string[] {
  const errores: string[] = [];
  const a = asunto.trim();
  const m = mensaje.trim();
  if (!a) errores.push('Escribe el asunto.');
  else if (a.length > MAX_ASUNTO) errores.push(`El asunto admite hasta ${MAX_ASUNTO} caracteres.`);
  if (!m) errores.push('Escribe tu mensaje.');
  else if (m.length > MAX_MENSAJE) errores.push(`El mensaje admite hasta ${MAX_MENSAJE} caracteres.`);
  return errores;
}

/** Errores del formulario de respuesta del ADMIN; vacío = se puede enviar. */
export function erroresDeRespuesta({ respuesta, estado }: RespuestaTicket): string[] {
  const errores: string[] = [];
  const r = respuesta.trim();
  if (!r) errores.push('Escribe la respuesta.');
  else if (r.length > MAX_RESPUESTA) {
    errores.push(`La respuesta admite hasta ${MAX_RESPUESTA} caracteres.`);
  }
  if (!esEstadoTicket(estado)) errores.push('Elige el estado del ticket.');
  return errores;
}

/**
 * Query de `GET /api/soporte/tickets`. Solo se envía `estado` si es uno del
 * enum: el backend no valida de forma amable un valor desconocido.
 */
export function parametrosDeTickets(
  filtros: FiltrosTickets,
  tamano: number = TAMANO_PAGINA_TICKETS,
): URLSearchParams {
  const params = new URLSearchParams();
  if (filtros.estado && esEstadoTicket(filtros.estado)) params.set('estado', filtros.estado);
  params.set('page', String(Math.max(0, Math.trunc(filtros.pagina) || 0)));
  params.set('size', String(tamano));
  return params;
}

/** Cambiar el filtro de estado vuelve a la primera página. */
export function conEstado(filtros: FiltrosTickets, estado: EstadoTicket | null): FiltrosTickets {
  return { ...filtros, estado, pagina: 0 };
}

/** Texto «Página X de Y» y si hay anterior/siguiente. */
export function navegacionDe(pagina: PaginaTickets) {
  return {
    texto: `Página ${pagina.pagina + 1} de ${pagina.totalPaginas}`,
    hayAnterior: pagina.pagina > 0,
    haySiguiente: pagina.pagina + 1 < pagina.totalPaginas,
  };
}

/** Fecha corta en `es-PE`; `—` si el backend no la trajo. */
export function fechaDeTicket(iso: string): string {
  if (!iso) return '—';
  const fecha = new Date(iso);
  return Number.isNaN(fecha.getTime()) ? '—' : fecha.toLocaleDateString('es-PE');
}

export function etiquetaDeEstadoTicket(estado: EstadoTicket): string {
  switch (estado) {
    case 'ABIERTO':
      return 'Abierto';
    case 'EN_PROCESO':
      return 'En proceso';
    case 'CERRADO':
      return 'Cerrado';
  }
}

/** Clases de la etiqueta de estado (texto + fondo, legibles en ambos temas). */
export function claseDeEstadoTicket(estado: EstadoTicket): string {
  switch (estado) {
    case 'ABIERTO':
      return 'border border-aviso-borde bg-aviso-fondo text-aviso-texto';
    case 'EN_PROCESO':
      return 'border border-info-borde bg-info-fondo text-info-texto';
    case 'CERRADO':
      return 'border border-linea bg-superficie-2 text-texto';
  }
}

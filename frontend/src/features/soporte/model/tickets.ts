/**
 * Reglas puras de soporte (US-25): validación de formularios, parámetros de
 * la bandeja del ADMIN y presentación del estado.
 *
 * Los límites replican los `@Size` de `CrearTicketRequest` y
 * `ResponderTicketRequest`. El backend sigue siendo la autoridad (responde
 * 400); validar aquí solo evita un viaje que va a fallar.
 */
import { esEstadoTicket, type EstadoTicket } from '@/lib/types/domain';
import type {
  FiltrosTickets,
  NuevoTicket,
  PaginaTickets,
  RespuestaTicket,
  TicketPropio,
} from './tipos';

export const MAX_ASUNTO = 200;
export const MAX_MENSAJE = 2000;
export const MAX_RESPUESTA = 2000;

/** Tamaño de página de la bandeja del ADMIN (el backend acepta 1..100). */
export const TAMANO_PAGINA_TICKETS = 20;

export const FILTROS_TICKETS_INICIALES: FiltrosTickets = { estado: null, pagina: 0 };

/**
 * US-25 Esc. 1: plazo de respuesta, en horas, que se anuncia antes de crear
 * un ticket. El backend lo fija (`plazoRespuestaHoras = 48`, handoff
 * `2026-11-23-cierre-mvp-backend.md`) y lo devuelve en cada ticket; este
 * valor es solo el respaldo para el texto previo al envío y para un backend
 * anterior que no lo traiga.
 */
export const PLAZO_RESPUESTA_HORAS_POR_DEFECTO = 48;

/** «48 horas», «1 hora». */
export function plazoDeAtencion(horas: number | null | undefined): string {
  const h =
    typeof horas === 'number' && Number.isInteger(horas) && horas > 0
      ? horas
      : PLAZO_RESPUESTA_HORAS_POR_DEFECTO;
  return h === 1 ? '1 hora' : `${h} horas`;
}

/** Texto del plazo antes de enviar (todavía no hay respuesta del servidor). */
export const PLAZO_DE_ATENCION = plazoDeAtencion(PLAZO_RESPUESTA_HORAS_POR_DEFECTO);

type Seguimiento = Pick<TicketPropio, 'id' | 'numeroSeguimiento'>;

/**
 * Número de seguimiento de un ticket: el que asigna el servidor
 * (`SOP-000123`). Respaldo para un backend anterior: `#id`. `null` si no hay
 * ninguno de los dos (`api.ts` traduce un id ausente a 0).
 */
export function numeroDeSeguimiento(ticket: Seguimiento): string | null {
  if (ticket.numeroSeguimiento) return ticket.numeroSeguimiento;
  return Number.isInteger(ticket.id) && ticket.id > 0 ? `#${ticket.id}` : null;
}

/**
 * Fecha y hora límite de la respuesta, en hora de Lima y formato `es-PE`
 * (`25/11/2026, 10:00`). `null` si no vino o no es una fecha válida.
 */
export function fechaLimiteDeRespuesta(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return null;
  return fecha.toLocaleString('es-PE', {
    timeZone: 'America/Lima',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
}

/** Confirmación tras crear un ticket (US-25 Esc. 1): número de seguimiento y plazo. */
export function confirmacionDeTicket(
  ticket: Seguimiento & Pick<TicketPropio, 'plazoRespuestaHoras' | 'respuestaEsperadaAntesDe'>,
): string {
  const numero = numeroDeSeguimiento(ticket);
  const registrado = numero
    ? `Registramos tu consulta con el número de seguimiento ${numero}.`
    : 'Registramos tu consulta.';
  const limite = fechaLimiteDeRespuesta(ticket.respuestaEsperadaAntesDe);
  const plazo = `un plazo de ${plazoDeAtencion(ticket.plazoRespuestaHoras)}`;
  const cuando = limite ? `${plazo} (antes del ${limite})` : plazo;
  return `${registrado} Te responderemos en ${cuando}, aquí y al correo de tu cuenta.`;
}

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

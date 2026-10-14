import { api } from '@/lib/api/client';
import { esEstadoTicket, type EstadoTicket } from '@/lib/types/domain';
import { parametrosDeTickets } from './model/tickets';
import type {
  FiltrosTickets,
  NuevoTicket,
  PaginaTickets,
  PaginaTicketsResponse,
  RespuestaTicket,
  TicketAdmin,
  TicketAdminResponse,
  TicketPropio,
  TicketSoporteResponse,
} from './model/tipos';

/**
 * API de soporte (US-25).
 *
 * - Crear y listar los propios: cualquier usuario autenticado. El correo de
 *   contacto no se envía: el backend lo toma de la cuenta.
 * - Bandeja y respuesta: solo ADMIN (403 para otro rol).
 */

/** Estado desconocido (no debería llegar) se trata como abierto: pendiente de atención. */
function estado(valor: string | undefined): EstadoTicket {
  return esEstadoTicket(valor) ? valor : 'ABIERTO';
}

export function aTicketPropio(t: TicketSoporteResponse): TicketPropio {
  return {
    id: t.id ?? 0,
    asunto: t.asunto ?? '',
    mensaje: t.mensaje ?? '',
    estado: estado(t.estado),
    respuesta: t.respuesta ?? null,
    createdAt: t.createdAt ?? '',
  };
}

export function aTicketAdmin(t: TicketAdminResponse): TicketAdmin {
  return {
    ...aTicketPropio(t),
    emailContacto: t.emailContacto ?? '',
    nombreAutor: t.nombreAutor ?? null,
    updatedAt: t.updatedAt ?? t.createdAt ?? '',
  };
}

export function aPaginaTickets(p: PaginaTicketsResponse): PaginaTickets {
  return {
    tickets: (p.content ?? []).map(aTicketAdmin),
    pagina: p.number ?? 0,
    totalPaginas: Math.max(1, p.totalPages ?? 1),
    total: p.totalElements ?? 0,
  };
}

/** US-25 Esc. 1: crea un ticket del usuario autenticado. */
export async function crearTicket(nuevo: NuevoTicket): Promise<TicketPropio> {
  const t = await api.post<TicketSoporteResponse>('/api/soporte/tickets', {
    asunto: nuevo.asunto.trim(),
    mensaje: nuevo.mensaje.trim(),
  });
  return aTicketPropio(t);
}

/** US-25: tickets que abrió el usuario autenticado, con su estado y respuesta. */
export async function misTickets(): Promise<TicketPropio[]> {
  const lista = await api.get<TicketSoporteResponse[]>('/api/soporte/tickets/mis-tickets');
  return lista.map(aTicketPropio);
}

/** US-25 Esc. 2: bandeja del ADMIN, paginada y opcionalmente filtrada por estado. */
export async function listarTickets(filtros: FiltrosTickets): Promise<PaginaTickets> {
  const pagina = await api.get<PaginaTicketsResponse>(
    `/api/soporte/tickets?${parametrosDeTickets(filtros).toString()}`,
  );
  return aPaginaTickets(pagina);
}

/** US-25 Esc. 2: el ADMIN responde y fija el estado del ticket. */
export async function responderTicket(id: number, r: RespuestaTicket): Promise<TicketPropio> {
  const t = await api.patch<TicketSoporteResponse>(`/api/soporte/tickets/${id}/responder`, {
    respuesta: r.respuesta.trim(),
    estado: r.estado,
  });
  return aTicketPropio(t);
}

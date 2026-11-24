/**
 * Tipos de la feature `soporte` (US-25, ARCHITECTURE.md §5.1).
 *
 * El spec de springdoc marca todo campo como opcional y el estado como
 * `string`; aquí se fija lo que el backend garantiza (handoff
 * `2026-10-13-soporte-admin.md`): `respuesta` y `nombreAutor` son los únicos
 * que pueden faltar, y llegan como `null`. `api.ts` hace esa traducción.
 */
import type { components } from '@/lib/api/generated/schema';
import type { EstadoTicket } from '@/lib/types/domain';

type Schemas = components['schemas'];

/** Respuestas crudas del API; solo `api.ts` las usa. */
export type TicketSoporteResponse = Schemas['TicketSoporteResponse'];
export type TicketAdminResponse = Schemas['TicketAdminResponse'];
export type PaginaTicketsResponse = Schemas['PageTicketAdminResponse'];

/** Ticket tal como lo ve su autor (`GET /mis-tickets`). Sin datos de contacto. */
export interface TicketPropio {
  id: number;
  asunto: string;
  mensaje: string;
  estado: EstadoTicket;
  /** `null` hasta que soporte responde. */
  respuesta: string | null;
  createdAt: string;
  /**
   * Número de seguimiento que asigna el servidor (`SOP-000123`, handoff
   * `2026-11-23-cierre-mvp-backend.md`). `null` con un backend anterior: la
   * PWA cae al `#id`.
   */
  numeroSeguimiento: string | null;
  /** Plazo de respuesta comprometido, en horas (48). `null` si no vino (ADMIN o backend anterior). */
  plazoRespuestaHoras: number | null;
  /** Instante ISO-8601 antes del cual se espera la respuesta. `null` si no vino. */
  respuestaEsperadaAntesDe: string | null;
}

/**
 * Ticket en la bandeja del ADMIN. `emailContacto` y `nombreAutor` son datos
 * personales: este tipo solo se usa en el área ADMIN, nunca en una vista de
 * ciudadano.
 */
export interface TicketAdmin extends TicketPropio {
  emailContacto: string;
  /** `null` si el ticket no tiene usuario (el esquema admite visitantes). */
  nombreAutor: string | null;
  updatedAt: string;
}

export interface PaginaTickets {
  tickets: TicketAdmin[];
  /** Página mostrada, desde 0. */
  pagina: number;
  /** Al menos 1, aunque no haya tickets. */
  totalPaginas: number;
  total: number;
}

/** Filtros de la bandeja del ADMIN: `estado` `null` = todos. */
export interface FiltrosTickets {
  estado: EstadoTicket | null;
  pagina: number;
}

export interface NuevoTicket {
  asunto: string;
  mensaje: string;
}

export interface RespuestaTicket {
  respuesta: string;
  estado: EstadoTicket;
}

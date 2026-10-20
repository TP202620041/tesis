'use client';

import { useCarga } from '@/lib/hooks/useCarga';
import { listarTickets } from '../api';
import type { FiltrosTickets, PaginaTickets } from '../model/tipos';

/** US-25 Esc. 2: página de la bandeja de soporte del ADMIN con sus filtros. */
export function useTicketsAdmin(filtros: FiltrosTickets) {
  return useCarga<PaginaTickets>(() => listarTickets(filtros), [filtros.estado, filtros.pagina]);
}

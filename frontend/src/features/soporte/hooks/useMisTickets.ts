'use client';

import { useCarga } from '@/lib/hooks/useCarga';
import { misTickets } from '../api';
import type { TicketPropio } from '../model/tipos';

/** US-25: tickets del usuario autenticado. */
export function useMisTickets() {
  return useCarga<TicketPropio[]>(() => misTickets(), []);
}

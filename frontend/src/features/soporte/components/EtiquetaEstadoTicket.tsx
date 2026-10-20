import type { EstadoTicket } from '@/lib/types/domain';
import { claseDeEstadoTicket, etiquetaDeEstadoTicket } from '../model/tickets';

/** Estado del ticket con su nombre (no solo color). */
export function EtiquetaEstadoTicket({ estado }: { estado: EstadoTicket }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${claseDeEstadoTicket(estado)}`}>
      {etiquetaDeEstadoTicket(estado)}
    </span>
  );
}

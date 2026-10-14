'use client';

import { useState } from 'react';
import { AlertaError } from '@/components/ui/form';
import { ESTADOS_TICKET, esEstadoTicket } from '@/lib/types/domain';
import { useTicketsAdmin } from '../hooks/useTicketsAdmin';
import {
  conEstado,
  etiquetaDeEstadoTicket,
  fechaDeTicket,
  FILTROS_TICKETS_INICIALES,
  navegacionDe,
} from '../model/tickets';
import type { FiltrosTickets, PaginaTickets, TicketAdmin } from '../model/tipos';
import { EtiquetaEstadoTicket } from './EtiquetaEstadoTicket';
import { ResponderTicket } from './ResponderTicket';

/**
 * US-25 Esc. 2: bandeja de soporte del ADMIN. Lista paginada en el servidor
 * (más recientes primero), filtro por estado y respuesta en línea. Tras
 * responder se recarga la página actual.
 */
export function BandejaSoporte() {
  const [filtros, setFiltros] = useState<FiltrosTickets>(FILTROS_TICKETS_INICIALES);
  const carga = useTicketsAdmin(filtros);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="filtro-estado-ticket"
          className="text-sm font-medium text-slate-700 dark:text-slate-200"
        >
          Estado
        </label>
        <select
          id="filtro-estado-ticket"
          value={filtros.estado ?? ''}
          onChange={(e) => {
            const valor = e.target.value;
            setFiltros((f) => conEstado(f, esEstadoTicket(valor) ? valor : null));
          }}
          className="max-w-xs rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900
                     dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
        >
          <option value="">Todos</option>
          {ESTADOS_TICKET.map((e) => (
            <option key={e} value={e}>
              {etiquetaDeEstadoTicket(e)}
            </option>
          ))}
        </select>
      </div>

      {carga.estado === 'cargando' && <p className="text-slate-600 dark:text-slate-400">Cargando…</p>}
      {carga.estado === 'error' && (
        <AlertaError mensaje={carga.error.mensaje} detalles={carga.error.detalles} />
      )}
      {carga.estado === 'listo' && (
        <ListaTickets
          pagina={carga.datos}
          onRespondido={carga.recargar}
          onPagina={(pagina) => setFiltros((f) => ({ ...f, pagina }))}
        />
      )}
    </div>
  );
}

function ListaTickets({
  pagina,
  onRespondido,
  onPagina,
}: {
  pagina: PaginaTickets;
  onRespondido: () => void;
  onPagina: (pagina: number) => void;
}) {
  if (pagina.tickets.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-md border border-dashed border-slate-300 p-8 text-center text-slate-500 dark:border-slate-600 dark:text-slate-400">
        <p>No hay tickets con este filtro.</p>
        {/* Responder el último ticket de una página filtrada la deja vacía. */}
        {pagina.pagina > 0 && (
          <button
            type="button"
            onClick={() => onPagina(0)}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm dark:border-slate-600 dark:text-slate-200"
          >
            Volver a la primera página
          </button>
        )}
      </div>
    );
  }
  const nav = navegacionDe(pagina);
  return (
    <>
      <p className="text-sm text-slate-600 dark:text-slate-400">
        {pagina.total} {pagina.total === 1 ? 'ticket' : 'tickets'}
      </p>
      <ul className="flex flex-col gap-3">
        {pagina.tickets.map((t) => (
          <TicketDeBandeja key={t.id} ticket={t} onRespondido={onRespondido} />
        ))}
      </ul>
      <nav aria-label="Paginación" className="flex items-center gap-3 text-sm">
        <button
          type="button"
          disabled={!nav.hayAnterior}
          onClick={() => onPagina(pagina.pagina - 1)}
          className="rounded-md border border-slate-300 px-3 py-1.5 disabled:opacity-50 dark:border-slate-600 dark:text-slate-200"
        >
          Anterior
        </button>
        <span className="text-slate-600 dark:text-slate-400">{nav.texto}</span>
        <button
          type="button"
          disabled={!nav.haySiguiente}
          onClick={() => onPagina(pagina.pagina + 1)}
          className="rounded-md border border-slate-300 px-3 py-1.5 disabled:opacity-50 dark:border-slate-600 dark:text-slate-200"
        >
          Siguiente
        </button>
      </nav>
    </>
  );
}

function TicketDeBandeja({
  ticket,
  onRespondido,
}: {
  ticket: TicketAdmin;
  onRespondido: () => void;
}) {
  return (
    <li className="flex flex-col gap-3 rounded-md border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
      <div className="flex flex-wrap items-center gap-2">
        <strong className="text-slate-900 dark:text-slate-100">{ticket.asunto}</strong>
        <EtiquetaEstadoTicket estado={ticket.estado} />
        <span className="text-xs text-slate-500 dark:text-slate-400">
          {fechaDeTicket(ticket.createdAt)}
        </span>
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
        <dt className="text-slate-500 dark:text-slate-400">Autor</dt>
        <dd className="text-slate-900 dark:text-slate-100">
          {ticket.nombreAutor ?? 'Sin cuenta asociada'}
        </dd>
        <dt className="text-slate-500 dark:text-slate-400">Contacto</dt>
        <dd className="break-all text-slate-900 dark:text-slate-100">{ticket.emailContacto}</dd>
      </dl>
      <p className="whitespace-pre-line text-sm text-slate-700 dark:text-slate-300">
        {ticket.mensaje}
      </p>
      <ResponderTicket ticket={ticket} onRespondido={onRespondido} />
    </li>
  );
}

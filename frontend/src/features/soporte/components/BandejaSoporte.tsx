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
import { clasesDeBoton } from '@/components/ui/Boton';

/**
 * US-25 Esc. 2: bandeja de soporte del ADMIN. Lista paginada en el servidor
 * (más recientes primero), filtro por estado y respuesta en línea. Tras
 * responder se recarga la página actual sin desmontar la lista (`useCarga`
 * conserva los datos mientras recarga): no se pierde el scroll ni lo escrito
 * en otras respuestas.
 */
export function BandejaSoporte() {
  const [filtros, setFiltros] = useState<FiltrosTickets>(FILTROS_TICKETS_INICIALES);
  const carga = useTicketsAdmin(filtros);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="filtro-estado-ticket"
          className="text-sm font-medium text-texto"
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
          className="min-h-objetivo max-w-xs rounded-control border border-linea-campo bg-superficie px-3 py-2 text-texto"
        >
          <option value="">Todos</option>
          {ESTADOS_TICKET.map((e) => (
            <option key={e} value={e}>
              {etiquetaDeEstadoTicket(e)}
            </option>
          ))}
        </select>
      </div>

      {carga.estado === 'cargando' && <p className="text-texto-2">Cargando…</p>}
      {carga.estado === 'error' && (
        <AlertaError mensaje={carga.error.mensaje} detalles={carga.error.detalles} />
      )}
      {carga.recargando && (
        <p role="status" className="text-sm text-texto-2">
          Actualizando…
        </p>
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
      <div className="flex flex-col items-center gap-3 rounded-control border border-dashed border-linea-campo p-8 text-center text-texto-2">
        <p>No hay tickets con este filtro.</p>
        {/* Responder el último ticket de una página filtrada la deja vacía. */}
        {pagina.pagina > 0 && (
          <button
            type="button"
            onClick={() => onPagina(0)}
            className={clasesDeBoton('secundario', 'compacto')}
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
      <p className="text-sm text-texto-2">
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
          className={clasesDeBoton('secundario', 'compacto')}
        >
          Anterior
        </button>
        <span className="text-texto-2">{nav.texto}</span>
        <button
          type="button"
          disabled={!nav.haySiguiente}
          onClick={() => onPagina(pagina.pagina + 1)}
          className={clasesDeBoton('secundario', 'compacto')}
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
    <li className="flex flex-col gap-3 rounded-control border border-linea bg-superficie p-4">
      <div className="flex flex-wrap items-center gap-2">
        <strong className="text-texto">{ticket.asunto}</strong>
        <EtiquetaEstadoTicket estado={ticket.estado} />
        <span className="text-xs text-texto-2">
          {fechaDeTicket(ticket.createdAt)}
        </span>
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
        <dt className="text-texto-2">Autor</dt>
        <dd className="text-texto">
          {ticket.nombreAutor ?? 'Sin cuenta asociada'}
        </dd>
        <dt className="text-texto-2">Contacto</dt>
        <dd className="break-all text-texto">{ticket.emailContacto}</dd>
      </dl>
      <p className="whitespace-pre-line text-sm text-texto">
        {ticket.mensaje}
      </p>
      <ResponderTicket ticket={ticket} onRespondido={onRespondido} />
    </li>
  );
}

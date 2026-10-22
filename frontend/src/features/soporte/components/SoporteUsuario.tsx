'use client';

import { AlertaError } from '@/components/ui/form';
import { useMisTickets } from '../hooks/useMisTickets';
import { EtiquetaEstadoTicket } from './EtiquetaEstadoTicket';
import { FormularioTicket } from './FormularioTicket';
import { fechaDeTicket } from '../model/tickets';
import type { TicketPropio } from '../model/tipos';

/**
 * US-25: soporte para cualquier usuario autenticado. Formulario para abrir
 * un ticket y la lista de los propios con su estado y la respuesta.
 */
export function SoporteUsuario() {
  const tickets = useMisTickets();

  return (
    <div className="flex flex-col gap-6">
      <FormularioTicket onCreado={tickets.recargar} />

      <section aria-labelledby="mis-tickets" className="flex flex-col gap-3">
        <h2 id="mis-tickets" className="text-lg font-semibold text-texto">
          Mis consultas
        </h2>
        {tickets.recargando && (
          <p role="status" className="text-sm text-texto-2">
            Actualizando…
          </p>
        )}
        {tickets.estado === 'cargando' && (
          <p className="text-texto-2">Cargando…</p>
        )}
        {tickets.estado === 'error' && (
          <AlertaError mensaje={tickets.error.mensaje} detalles={tickets.error.detalles} />
        )}
        {tickets.estado === 'listo' && tickets.datos.length === 0 && (
          <p className="rounded-control border border-dashed border-linea-campo p-6 text-center text-texto-2">
            Todavía no enviaste ninguna consulta.
          </p>
        )}
        {tickets.estado === 'listo' && tickets.datos.length > 0 && (
          <ul className="flex flex-col gap-2">
            {tickets.datos.map((t) => (
              <TicketDeUsuario key={t.id} ticket={t} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function TicketDeUsuario({ ticket }: { ticket: TicketPropio }) {
  return (
    <li className="flex flex-col gap-2 rounded-control border border-linea bg-superficie p-3">
      <div className="flex flex-wrap items-center gap-2">
        <strong className="text-texto">{ticket.asunto}</strong>
        <EtiquetaEstadoTicket estado={ticket.estado} />
        <span className="text-xs text-texto-2">
          {fechaDeTicket(ticket.createdAt)}
        </span>
      </div>
      <p className="whitespace-pre-line text-sm text-texto">
        {ticket.mensaje}
      </p>
      {ticket.respuesta ? (
        <div className="rounded-control bg-info-fondo px-3 py-2 text-sm">
          <p className="font-medium text-info-texto">Respuesta de soporte</p>
          <p className="whitespace-pre-line text-info-texto">{ticket.respuesta}</p>
        </div>
      ) : (
        <p className="text-xs text-texto-2">Aún sin respuesta.</p>
      )}
    </li>
  );
}

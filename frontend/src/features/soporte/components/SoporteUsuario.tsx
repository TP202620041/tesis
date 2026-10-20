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
        <h2 id="mis-tickets" className="text-lg font-semibold text-slate-900 dark:text-slate-100">
          Mis consultas
        </h2>
        {tickets.recargando && (
          <p role="status" className="text-sm text-slate-500 dark:text-slate-400">
            Actualizando…
          </p>
        )}
        {tickets.estado === 'cargando' && (
          <p className="text-slate-600 dark:text-slate-400">Cargando…</p>
        )}
        {tickets.estado === 'error' && (
          <AlertaError mensaje={tickets.error.mensaje} detalles={tickets.error.detalles} />
        )}
        {tickets.estado === 'listo' && tickets.datos.length === 0 && (
          <p className="rounded-md border border-dashed border-slate-300 p-6 text-center text-slate-500 dark:border-slate-600 dark:text-slate-400">
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
    <li className="flex flex-col gap-2 rounded-md border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-800">
      <div className="flex flex-wrap items-center gap-2">
        <strong className="text-slate-900 dark:text-slate-100">{ticket.asunto}</strong>
        <EtiquetaEstadoTicket estado={ticket.estado} />
        <span className="text-xs text-slate-500 dark:text-slate-400">
          {fechaDeTicket(ticket.createdAt)}
        </span>
      </div>
      <p className="whitespace-pre-line text-sm text-slate-700 dark:text-slate-300">
        {ticket.mensaje}
      </p>
      {ticket.respuesta ? (
        <div className="rounded-md bg-sky-50 px-3 py-2 text-sm dark:bg-sky-950">
          <p className="font-medium text-sky-900 dark:text-sky-100">Respuesta de soporte</p>
          <p className="whitespace-pre-line text-sky-900 dark:text-sky-100">{ticket.respuesta}</p>
        </div>
      ) : (
        <p className="text-xs text-slate-500 dark:text-slate-400">Aún sin respuesta.</p>
      )}
    </li>
  );
}

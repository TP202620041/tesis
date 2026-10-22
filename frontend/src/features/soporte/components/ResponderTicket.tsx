'use client';

import { useState, type FormEvent } from 'react';
import { AlertaError, Boton } from '@/components/ui/form';
import { ESTADOS_TICKET, esEstadoTicket, type EstadoTicket } from '@/lib/types/domain';
import { useResponderTicket } from '../hooks/useResponderTicket';
import { etiquetaDeEstadoTicket, MAX_RESPUESTA } from '../model/tickets';
import type { TicketAdmin } from '../model/tipos';

/**
 * US-25 Esc. 2: el ADMIN responde un ticket y fija su estado. Parte de la
 * respuesta vigente (si la hay) y propone CERRADO, que es lo habitual al
 * responder; puede dejarlo EN_PROCESO si la consulta sigue abierta.
 */
export function ResponderTicket({
  ticket,
  onRespondido,
}: {
  ticket: TicketAdmin;
  onRespondido: () => void;
}) {
  const { responder, enviando, error } = useResponderTicket();
  const [respuesta, setRespuesta] = useState(ticket.respuesta ?? '');
  const [estado, setEstado] = useState<EstadoTicket>(
    ticket.estado === 'ABIERTO' ? 'CERRADO' : ticket.estado,
  );
  const idBase = `ticket-${ticket.id}`;

  async function enviar(e: FormEvent) {
    e.preventDefault();
    if (await responder(ticket.id, { respuesta, estado })) onRespondido();
  }

  return (
    <form onSubmit={enviar} noValidate className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor={`${idBase}-respuesta`}
          className="text-sm font-medium text-texto"
        >
          Respuesta
        </label>
        <textarea
          id={`${idBase}-respuesta`}
          value={respuesta}
          maxLength={MAX_RESPUESTA}
          rows={3}
          required
          onChange={(e) => setRespuesta(e.target.value)}
          className="rounded-control border border-linea-campo bg-superficie px-3 py-2 text-texto
                     focus:border-primario"
        />
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor={`${idBase}-estado`}
            className="text-sm font-medium text-texto"
          >
            Estado
          </label>
          <select
            id={`${idBase}-estado`}
            value={estado}
            onChange={(e) => {
              if (esEstadoTicket(e.target.value)) setEstado(e.target.value);
            }}
            className="min-h-objetivo rounded-control border border-linea-campo bg-superficie px-3 py-2 text-texto"
          >
            {ESTADOS_TICKET.map((e) => (
              <option key={e} value={e}>
                {etiquetaDeEstadoTicket(e)}
              </option>
            ))}
          </select>
        </div>
        <Boton cargando={enviando}>Enviar respuesta</Boton>
      </div>
      {error && <AlertaError mensaje={error.mensaje} detalles={error.detalles} />}
    </form>
  );
}

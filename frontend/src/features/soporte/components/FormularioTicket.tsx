'use client';

import { useState, type FormEvent } from 'react';
import type { TicketPropio } from '../model/tipos';
import { Aviso } from '@/components/ui/Aviso';
import { AlertaError, Boton, Campo } from '@/components/ui/form';
import { useCrearTicket } from '../hooks/useCrearTicket';
import { confirmacionDeTicket, MAX_ASUNTO, MAX_MENSAJE, PLAZO_DE_ATENCION } from '../model/tickets';

/**
 * US-25 Esc. 1: formulario para abrir un ticket de soporte. Al registrarlo
 * confirma el número de seguimiento y el plazo de respuesta que devuelve el
 * servidor (con respaldo si un backend anterior no los trae).
 */
export function FormularioTicket({ onCreado }: { onCreado: () => void }) {
  const { crear, enviando, error } = useCrearTicket();
  const [asunto, setAsunto] = useState('');
  const [mensaje, setMensaje] = useState('');
  /** Ticket recién creado (US-25 Esc. 1), o `null` si no hay confirmación que mostrar. */
  const [creado, setCreado] = useState<TicketPropio | null>(null);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setCreado(null);
    const ticket = await crear({ asunto, mensaje });
    if (ticket) {
      setAsunto('');
      setMensaje('');
      setCreado(ticket);
      onCreado();
    }
  }

  return (
    <form
      onSubmit={enviar}
      noValidate
      className="flex flex-col gap-4 rounded-tarjeta border border-linea bg-superficie p-4"
    >
      <h2 className="text-lg font-semibold text-texto">Nueva consulta</h2>
      <p className="text-sm text-texto-2">
        Te responderemos en un plazo de {PLAZO_DE_ATENCION}, aquí y al correo de tu cuenta.
      </p>

      <Campo
        id="ticket-asunto"
        etiqueta="Asunto"
        value={asunto}
        maxLength={MAX_ASUNTO}
        onChange={(e) => setAsunto(e.target.value)}
        required
      />

      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="ticket-mensaje"
          className="text-sm font-medium text-texto"
        >
          Mensaje
        </label>
        <textarea
          id="ticket-mensaje"
          value={mensaje}
          maxLength={MAX_MENSAJE}
          rows={5}
          required
          aria-describedby="ticket-mensaje-cuenta"
          onChange={(e) => setMensaje(e.target.value)}
          className="rounded-control border border-linea-campo bg-superficie px-3 py-2 text-texto focus:border-primario"
        />
        <p id="ticket-mensaje-cuenta" className="text-xs text-texto-2">
          {mensaje.length} / {MAX_MENSAJE}
        </p>
      </div>

      {error && <AlertaError mensaje={error.mensaje} detalles={error.detalles} />}
      {/* Region viva siempre montada: el lector anuncia el texto que aparece dentro. */}
      <div role="status">
        {creado !== null && (
          <Aviso tono="exito" titulo="Recibimos tu consulta">
            <p>{confirmacionDeTicket(creado)}</p>
            <p>Puedes seguir su estado en «Mis consultas», más abajo.</p>
          </Aviso>
        )}
      </div>

      <div>
        <Boton cargando={enviando}>Enviar consulta</Boton>
      </div>
    </form>
  );
}

'use client';

import { useState, type FormEvent } from 'react';
import { AlertaError, Boton, Campo } from '@/components/ui/form';
import { useCrearTicket } from '../hooks/useCrearTicket';
import { MAX_ASUNTO, MAX_MENSAJE } from '../model/tickets';

/** US-25 Esc. 1: formulario para abrir un ticket de soporte. */
export function FormularioTicket({ onCreado }: { onCreado: () => void }) {
  const { crear, enviando, error } = useCrearTicket();
  const [asunto, setAsunto] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [enviado, setEnviado] = useState(false);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setEnviado(false);
    const creado = await crear({ asunto, mensaje });
    if (creado) {
      setAsunto('');
      setMensaje('');
      setEnviado(true);
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
        Te responderemos aquí y al correo de tu cuenta.
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
      {enviado && (
        <p role="status" className="text-sm text-exito-texto">
          Recibimos tu consulta. Puedes seguir su estado en la lista de abajo.
        </p>
      )}

      <div>
        <Boton cargando={enviando}>Enviar consulta</Boton>
      </div>
    </form>
  );
}

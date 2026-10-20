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
      className="flex flex-col gap-4 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800"
    >
      <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Nueva consulta</h2>
      <p className="text-sm text-slate-600 dark:text-slate-400">
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
          className="text-sm font-medium text-slate-700 dark:text-slate-200"
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
          className="rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 outline-none
                     focus:border-sky-500 focus:ring-2 focus:ring-sky-500/30
                     dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
        />
        <p id="ticket-mensaje-cuenta" className="text-xs text-slate-500 dark:text-slate-400">
          {mensaje.length} / {MAX_MENSAJE}
        </p>
      </div>

      {error && <AlertaError mensaje={error.mensaje} detalles={error.detalles} />}
      {enviado && (
        <p role="status" className="text-sm text-emerald-700 dark:text-emerald-300">
          Recibimos tu consulta. Puedes seguir su estado en la lista de abajo.
        </p>
      )}

      <div>
        <Boton cargando={enviando}>Enviar consulta</Boton>
      </div>
    </form>
  );
}

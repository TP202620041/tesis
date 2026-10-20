'use client';

import { useState } from 'react';
import { AlertaError, Boton } from '@/components/ui/form';
import { ApiError, NetworkError } from '@/lib/api/client';
import { cambiarEstado } from '../api';
import { esTerminal, exigeComentario, transicionesDesde } from '../model/transiciones';
import { estiloDeEstado } from '@/lib/types/estados';
import type { ReporteGestion } from '../model/tipos';

/** US-14: el funcionario mueve el reporte por la maquina de estados. */
export function CambiarEstado({
  reporte,
  onCambiado,
}: {
  reporte: ReporteGestion;
  onCambiado: (actualizado: ReporteGestion) => void;
}) {
  const actual = reporte.estado ?? '';
  const opciones = transicionesDesde(actual);
  const [destino, setDestino] = useState('');
  const [comentario, setComentario] = useState('');
  const [error, setError] = useState<{ mensaje: string; detalles: string[] } | null>(null);
  const [enviando, setEnviando] = useState(false);

  if (esTerminal(actual)) {
    return (
      <p className="rounded-md border border-slate-200 p-3 text-sm text-slate-600 dark:border-slate-700 dark:text-slate-400">
        Este reporte está en <strong>{estiloDeEstado(actual).etiqueta}</strong>, un estado final:
        ya no admite más cambios.
      </p>
    );
  }

  const comentarioRequerido = exigeComentario(destino);
  const faltaComentario = comentarioRequerido && !comentario.trim();

  async function enviar(evento: React.FormEvent) {
    evento.preventDefault();
    setError(null);
    if (!destino) return;
    // El backend responde 400 si se rechaza sin justificar; se exige antes
    // de enviar para que el funcionario no pierda lo escrito.
    if (faltaComentario) {
      setError({ mensaje: 'Para rechazar un reporte debes explicar el motivo.', detalles: [] });
      return;
    }

    setEnviando(true);
    try {
      const actualizado = await cambiarEstado(reporte.id ?? 0, destino, comentario);
      setDestino('');
      setComentario('');
      onCambiado(actualizado);
    } catch (e) {
      if (e instanceof NetworkError) {
        setError({ mensaje: 'Sin conexión con el servidor.', detalles: [] });
      } else if (e instanceof ApiError) {
        // 409 = transición inválida (el backend es la autoridad sobre eso).
        // 403 = el reporte no es de tu distrito.
        setError({ mensaje: e.message, detalles: e.details });
      } else {
        setError({ mensaje: 'Ocurrió un error inesperado.', detalles: [] });
      }
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={enviar} className="flex flex-col gap-3" noValidate>
      <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Cambiar estado</h2>
      {error && <AlertaError mensaje={error.mensaje} detalles={error.detalles} />}

      <div className="flex flex-col gap-1.5">
        <label htmlFor="destino" className="text-sm text-slate-700 dark:text-slate-200">
          Nuevo estado
        </label>
        <select
          id="destino"
          value={destino}
          onChange={(e) => setDestino(e.target.value)}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
        >
          <option value="">Selecciona…</option>
          {opciones.map((estado) => (
            <option key={estado} value={estado}>
              {estiloDeEstado(estado).etiqueta}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="comentario" className="text-sm text-slate-700 dark:text-slate-200">
          Comentario{' '}
          <span className="font-normal text-slate-500">
            {comentarioRequerido ? '(obligatorio para rechazar)' : '(opcional)'}
          </span>
        </label>
        <textarea
          id="comentario"
          rows={3}
          maxLength={500}
          required={comentarioRequerido}
          aria-invalid={faltaComentario ? true : undefined}
          value={comentario}
          onChange={(e) => setComentario(e.target.value)}
          placeholder={
            comentarioRequerido
              ? 'Explica por qué se rechaza este reporte…'
              : 'Notas para el ciudadano…'
          }
          className="rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
        />
      </div>

      <Boton cargando={enviando} disabled={!destino || faltaComentario}>
        Actualizar estado
      </Boton>
    </form>
  );
}

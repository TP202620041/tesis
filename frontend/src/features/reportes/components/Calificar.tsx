'use client';

import { useState } from 'react';
import { AlertaError, Boton } from '@/components/ui/form';
import { ApiError, NetworkError } from '@/lib/api/client';
import { calificar } from '@/features/reportes/api';

/**
 * US-26: el ciudadano califica la atencion recibida tras la resolucion.
 *
 * Solo el CREADOR puede calificar (asimetria intencional con US-22, donde el
 * adherido si ve el historial: calificar es el juicio de quien reporto), una
 * sola vez, y solo sobre un reporte RESUELTO. El backend responde 403/409
 * ante cada caso; aqui la pantalla solo se muestra cuando corresponde.
 *
 * <b>Limitacion conocida:</b> el API no expone la calificacion ya emitida
 * (solo existe el POST), asi que al volver a esta pantalla no se puede
 * mostrar "ya calificaste con N estrellas". Si el ciudadano lo intenta de
 * nuevo, el 409 del backend se traduce en un mensaje claro.
 */
export function Calificar({ reporteId }: { reporteId: number }) {
  const [estrellas, setEstrellas] = useState(0);
  const [comentario, setComentario] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [listo, setListo] = useState(false);
  const [error, setError] = useState<{ mensaje: string; detalles: string[] } | null>(null);

  if (listo) {
    return (
      <p
        aria-live="polite"
        className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100"
      >
        ¡Gracias! Tu calificación quedó registrada y alimenta el índice público de desempeño de
        tu municipalidad.
      </p>
    );
  }

  async function enviar(evento: React.FormEvent) {
    evento.preventDefault();
    setError(null);
    if (estrellas < 1) {
      setError({ mensaje: 'Elige de 1 a 5 estrellas.', detalles: [] });
      return;
    }
    setEnviando(true);
    try {
      await calificar(reporteId, estrellas, comentario);
      setListo(true);
    } catch (e) {
      if (e instanceof NetworkError) {
        setError({ mensaje: 'Sin conexión con el servidor.', detalles: [] });
      } else if (e instanceof ApiError) {
        // 409 = ya calificaste, o el reporte no está resuelto.
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
      <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
        ¿Cómo fue la atención?
      </h2>
      {error && <AlertaError mensaje={error.mensaje} detalles={error.detalles} />}

      {/* Grupo de radios, no botones: es una eleccion entre opciones
          excluyentes y asi funciona con teclado y lector de pantalla. */}
      <fieldset className="flex flex-col gap-1.5">
        <legend className="text-sm text-slate-700 dark:text-slate-200">Calificación</legend>
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map((valor) => (
            <label
              key={valor}
              className="cursor-pointer text-2xl leading-none"
              title={`${valor} de 5`}
            >
              <input
                type="radio"
                name="estrellas"
                value={valor}
                checked={estrellas === valor}
                onChange={() => setEstrellas(valor)}
                className="sr-only"
              />
              <span
                aria-hidden="true"
                className={valor <= estrellas ? 'text-amber-500' : 'text-slate-300 dark:text-slate-600'}
              >
                ★
              </span>
              <span className="sr-only">{valor} estrellas</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="comentario-calif" className="text-sm text-slate-700 dark:text-slate-200">
          Comentario <span className="font-normal text-slate-500">(opcional)</span>
        </label>
        <textarea
          id="comentario-calif"
          rows={3}
          maxLength={1000}
          value={comentario}
          onChange={(e) => setComentario(e.target.value)}
          placeholder="¿La reparación quedó bien? ¿Tardaron mucho?"
          className="rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
        />
      </div>

      <Boton cargando={enviando} disabled={estrellas < 1}>
        Enviar calificación
      </Boton>
    </form>
  );
}

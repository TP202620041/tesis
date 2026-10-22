'use client';

import { useState } from 'react';
import { AlertaError, Boton } from '@/components/ui/form';
import { useCalificar } from '../hooks/useCalificar';
import type { Calificacion } from '../model/tipos';

/**
 * US-26: el ciudadano califica la atencion recibida tras la resolucion.
 *
 * Solo el CREADOR puede calificar (asimetria intencional con US-22, donde el
 * adherido si ve el historial: calificar es el juicio de quien reporto), una
 * sola vez, y solo sobre un reporte RESUELTO. El backend responde 403/409
 * ante cada caso; aqui la pantalla solo se muestra cuando corresponde.
 *
 * Al montarse consulta si el ciudadano ya califico: si lo hizo, muestra lo
 * que dijo en vez del formulario. Un 404 en esa consulta no es un fallo,
 * es la senal de "todavia no calificaste".
 */
export function Calificar({ reporteId }: { reporteId: number }) {
  const { cargando, existente, enviar: calificar, enviando, error } = useCalificar(reporteId);
  const [estrellas, setEstrellas] = useState(0);
  const [comentario, setComentario] = useState('');

  if (cargando) {
    return <p className="text-sm text-texto-2">Cargando…</p>;
  }

  if (existente) {
    return <CalificacionEmitida calificacion={existente} />;
  }

  async function enviar(evento: React.FormEvent) {
    evento.preventDefault();
    await calificar(estrellas, comentario);
  }

  return (
    <form onSubmit={enviar} className="flex flex-col gap-3" noValidate>
      <h2 className="text-sm font-semibold text-texto">
        ¿Cómo fue la atención?
      </h2>
      {/* La invitacion vive aqui y no en la explicacion del estado (QA-1
          M-13): al calificar, este formulario se reemplaza por lo que se
          califico y la invitacion se va con el. */}
      <p className="text-sm text-texto-2">
        Puedes calificar la atención recibida. Tu opinión alimenta el índice público de desempeño
        de tu municipalidad.
      </p>
      {error && <AlertaError mensaje={error.mensaje} detalles={error.detalles} />}

      {/* Grupo de radios, no botones: es una eleccion entre opciones
          excluyentes y asi funciona con teclado y lector de pantalla. */}
      <fieldset className="flex flex-col gap-1.5">
        <legend className="text-sm text-texto">Calificación</legend>
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map((valor) => (
            <label
              key={valor}
              className="cursor-pointer rounded-control px-0.5 text-2xl leading-none has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-foco"
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
                className={valor <= estrellas ? 'text-texto' : 'text-linea-campo'}
              >
                ★
              </span>
              {/* QA-1 M-1: «1 estrella», no «1 estrellas». */}
              <span className="sr-only">{valor === 1 ? '1 estrella' : `${valor} estrellas`}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="comentario-calif" className="text-sm text-texto">
          Comentario <span className="font-normal text-texto-2">(opcional)</span>
        </label>
        <textarea
          id="comentario-calif"
          rows={3}
          maxLength={1000}
          value={comentario}
          onChange={(e) => setComentario(e.target.value)}
          placeholder="¿La reparación quedó bien? ¿Tardaron mucho?"
          className="bg-superficie text-texto rounded-control border border-linea-campo px-3 py-2 text-sm"
        />
      </div>

      <Boton cargando={enviando} disabled={estrellas < 1}>
        Enviar calificación
      </Boton>
    </form>
  );
}

/**
 * Lo que el ciudadano ya calificó.
 *
 * Se le devuelve su aporte, no solo un "ya calificaste": el sistema le pidió
 * una opinión y mostrarla cerrada es parte de que esa opinión cuente.
 */
function CalificacionEmitida({ calificacion }: { calificacion: Calificacion }) {
  const estrellas = calificacion.estrellas ?? 0;
  return (
    <div className="flex flex-col gap-2" aria-live="polite">
      <h2 className="text-sm font-semibold text-texto">Tu calificación</h2>
      <p className="flex items-center gap-2">
        <span aria-hidden="true" className="text-2xl leading-none">
          {[1, 2, 3, 4, 5].map((v) => (
            <span
              key={v}
              className={v <= estrellas ? 'text-texto' : 'text-linea-campo'}
            >
              ★
            </span>
          ))}
        </span>
        <span className="text-sm text-texto">
          {estrellas} de 5
          {calificacion.createdAt
            ? ` · ${new Date(calificacion.createdAt).toLocaleDateString('es-PE')}`
            : ''}
        </span>
      </p>
      {calificacion.comentario && (
        <p className="text-sm text-texto-2">
          «{calificacion.comentario}»
        </p>
      )}
      <p className="text-xs text-texto-2">
        Ya calificaste este reporte. Tu opinión alimenta el índice público de desempeño de tu
        municipalidad.
      </p>
    </div>
  );
}

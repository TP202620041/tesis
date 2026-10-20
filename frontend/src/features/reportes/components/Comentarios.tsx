'use client';

import { useState } from 'react';
import { AlertaError, Boton } from '@/components/ui/form';
import { useComentarios } from '../hooks/useComentarios';

/**
 * US-27: comentarios publicos sobre un reporte resuelto.
 *
 * Reglas verificadas contra el backend, no supuestas:
 *  - LEER es publico: no exige sesion. Un vecino, un periodista o el jurado
 *    pueden ver si la reparacion funciono sin registrarse.
 *  - ESCRIBIR lo puede hacer CUALQUIER ciudadano autenticado, no solo el
 *    creador. Es una asimetria deliberada frente a calificar (US-26, solo el
 *    autor): comentar es opinion publica verificable —"paso por ahi y sigue
 *    roto"— mientras que calificar es el juicio de quien reporto.
 *  - Solo sobre reportes RESUELTO; el backend responde 409 en otro caso.
 *
 * El detector de reincidencia marca el reporte para la bandeja municipal
 * (US-13), pero eso NO se muestra aqui ni viaja en la respuesta publica:
 * revelar que comentarios marca el detector permitiria sondear sus palabras
 * clave y manipular en que se fija el municipio.
 */
export function Comentarios({
  reporteId,
  puedeComentar,
}: {
  reporteId: number;
  /** `false` para visitantes sin sesion: ven los comentarios, no el formulario. */
  puedeComentar: boolean;
}) {
  const { cargando, comentarios, publicar, enviando, error } = useComentarios(reporteId);
  const [contenido, setContenido] = useState('');

  async function enviar(evento: React.FormEvent) {
    evento.preventDefault();
    if (await publicar(contenido)) setContenido('');
  }

  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
        ¿Quedó bien la reparación?
      </h2>

      {cargando ? (
        <p className="text-sm text-slate-500">Cargando comentarios…</p>
      ) : comentarios.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Todavía nadie comentó sobre esta reparación.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {comentarios.map((c) => (
            <li
              key={c.id}
              className="rounded-md border border-slate-200 p-3 text-sm dark:border-slate-700"
            >
              <p className="text-slate-800 dark:text-slate-200">{c.contenido}</p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                {c.autor}
                {c.createdAt ? ` · ${new Date(c.createdAt).toLocaleDateString('es-PE')}` : ''}
              </p>
            </li>
          ))}
        </ul>
      )}

      {puedeComentar ? (
        <form onSubmit={enviar} className="flex flex-col gap-2" noValidate>
          {error && <AlertaError mensaje={error.mensaje} detalles={error.detalles} />}
          <label htmlFor="comentario-publico" className="text-sm text-slate-700 dark:text-slate-200">
            Escribe tu comentario
          </label>
          <textarea
            id="comentario-publico"
            rows={3}
            maxLength={1000}
            value={contenido}
            onChange={(e) => setContenido(e.target.value)}
            placeholder="¿Pasaste por ahí? Cuéntanos si el daño quedó reparado o volvió a aparecer."
            className="rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
          />
          <Boton cargando={enviando} disabled={!contenido.trim()}>
            Publicar comentario
          </Boton>
        </form>
      ) : (
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Inicia sesión para comentar sobre esta reparación.
        </p>
      )}
    </section>
  );
}

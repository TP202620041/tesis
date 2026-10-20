'use client';

import { useState } from 'react';
import type { ReporteEnColaVisible } from '../hooks/useColaOffline';
import type { ReporteEnCola } from '../model/colaOffline';

type Accion = { clave: string; tipo: 'descartar' | 'reenviar' };

/**
 * US-06: reportes guardados en este dispositivo que todavia no llegaron al
 * backend.
 *
 * - `pendiente`: se envia solo.
 * - `rechazado`: el backend dijo que no (p. ej. fuera de cobertura);
 *   reintentar no cambiaria la respuesta. Se puede descartar.
 * - `caducado`: lleva mas de 48 h y la clave de idempotencia ya vencio en el
 *   backend. Pudo haber llegado: se pide revisar "Mis reportes" antes de
 *   reenviarlo con una clave nueva, o descartarlo.
 *
 * Descartar y reenviar piden confirmacion.
 */
export function PendientesDeEnvio({
  pendientes,
  onDescartar,
  onReenviarConClaveNueva,
}: {
  pendientes: ReporteEnColaVisible[];
  onDescartar: (idempotencyKey: string) => void;
  onReenviarConClaveNueva: (reporte: ReporteEnCola) => void;
}) {
  const [confirmando, setConfirmando] = useState<Accion | null>(null);
  if (pendientes.length === 0) return null;

  return (
    <section
      aria-labelledby="pendientes-de-envio"
      className="flex flex-col gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 dark:border-amber-700 dark:bg-amber-950"
    >
      <h2 id="pendientes-de-envio" className="text-sm font-semibold text-amber-900 dark:text-amber-100">
        Pendiente de envío
      </h2>
      <p className="text-xs text-amber-900 dark:text-amber-100">
        Guardados en este dispositivo sin conexión. Se envían solos cuando vuelve la señal.
      </p>
      <ul className="flex flex-col gap-1.5">
        {pendientes.map((r) => {
          const enConfirmacion = confirmando?.clave === r.idempotencyKey ? confirmando : null;
          return (
            <li
              key={r.idempotencyKey}
              className="flex flex-col gap-1 rounded bg-white px-3 py-2 text-sm dark:bg-slate-800"
            >
              <span className="text-slate-700 dark:text-slate-200">
                Reporte del {new Date(r.creadoEn).toLocaleString('es-PE')}
                {r.foto ? ' · con foto' : ''}
              </span>

              {r.visible === 'pendiente' && (
                <span className="text-amber-800 dark:text-amber-200">Pendiente de envío</span>
              )}
              {r.visible === 'rechazado' && (
                <span role="alert" className="text-red-700 dark:text-red-300">
                  No se pudo enviar{r.motivo ? `: ${r.motivo}` : ''}
                </span>
              )}
              {r.visible === 'caducado' && (
                <span role="alert" className="text-red-700 dark:text-red-300">
                  Caducado: revisa Mis reportes antes de reenviarlo
                </span>
              )}

              {r.visible !== 'pendiente' && !enConfirmacion && (
                <span className="flex flex-wrap gap-3">
                  {r.visible === 'caducado' && (
                    <button
                      type="button"
                      onClick={() => setConfirmando({ clave: r.idempotencyKey, tipo: 'reenviar' })}
                      className="text-sm font-medium text-sky-700 hover:underline dark:text-sky-400"
                    >
                      Reenviar
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setConfirmando({ clave: r.idempotencyKey, tipo: 'descartar' })}
                    className="text-sm font-medium text-sky-700 hover:underline dark:text-sky-400"
                  >
                    Descartar
                  </button>
                </span>
              )}

              {enConfirmacion && (
                <span className="flex flex-wrap items-center gap-3">
                  <span className="text-slate-700 dark:text-slate-200">
                    {enConfirmacion.tipo === 'reenviar'
                      ? '¿Confirmas que no aparece en Mis reportes? Se enviará como un reporte nuevo.'
                      : '¿Descartar este reporte? No se podrá recuperar.'}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setConfirmando(null);
                      if (enConfirmacion.tipo === 'reenviar') onReenviarConClaveNueva(r);
                      else onDescartar(r.idempotencyKey);
                    }}
                    className="text-sm font-medium text-red-700 hover:underline dark:text-red-300"
                  >
                    Sí, {enConfirmacion.tipo === 'reenviar' ? 'reenviar' : 'descartar'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmando(null)}
                    className="text-sm font-medium text-slate-600 hover:underline dark:text-slate-300"
                  >
                    Cancelar
                  </button>
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

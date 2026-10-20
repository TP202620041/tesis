'use client';

import type { ReporteEnCola } from '../model/colaOffline';

/**
 * US-06: reportes guardados en este dispositivo que todavia no llegaron al
 * backend. Los `pendiente` se envian solos; los `rechazado` (el backend dijo
 * que no, p. ej. fuera de cobertura) esperan a que el ciudadano los descarte,
 * porque reintentarlos no cambiaria la respuesta.
 */
export function PendientesDeEnvio({
  pendientes,
  onDescartar,
}: {
  pendientes: ReporteEnCola[];
  onDescartar: (idempotencyKey: string) => void;
}) {
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
        {pendientes.map((r) => (
          <li
            key={r.idempotencyKey}
            className="flex flex-wrap items-center justify-between gap-2 rounded bg-white px-3 py-2 text-sm dark:bg-slate-800"
          >
            <span className="text-slate-700 dark:text-slate-200">
              Reporte del {new Date(r.creadoEn).toLocaleString('es-PE')}
              {r.foto ? ' · con foto' : ''}
            </span>
            {r.estado === 'rechazado' ? (
              <span className="flex flex-wrap items-center gap-2">
                <span role="alert" className="text-red-700 dark:text-red-300">
                  No se pudo enviar{r.motivo ? `: ${r.motivo}` : ''}
                </span>
                <button
                  type="button"
                  onClick={() => onDescartar(r.idempotencyKey)}
                  className="text-sm font-medium text-sky-700 hover:underline dark:text-sky-400"
                >
                  Descartar
                </button>
              </span>
            ) : (
              <span className="text-amber-800 dark:text-amber-200">Pendiente de envío</span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

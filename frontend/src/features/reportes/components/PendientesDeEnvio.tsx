'use client';

import { useState } from 'react';
import type { Severidad } from '@/lib/types/domain';
import type { ErrorAlCompletar, ReporteEnColaVisible } from '../hooks/useColaOffline';
import { useTituloSugerido } from '../hooks/useTituloSugerido';
import { avisoDeIncompleto, type ReporteEnCola } from '../model/colaOffline';
import { erroresDeTituloYSeveridad } from '../model/titulo';
import { CampoSeveridad, CampoTitulo } from './CamposTituloYSeveridad';

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
 * - `incompleto` (NC-02): lo guardo la version anterior, sin titulo ni
 *   severidad. No se envia solo ni se purga: el ciudadano lo completa aqui
 *   (con la misma clave) o lo descarta.
 *
 * Descartar y reenviar piden confirmacion.
 */
export function PendientesDeEnvio({
  pendientes,
  onDescartar,
  onReenviarConClaveNueva,
  onCompletar,
}: {
  pendientes: ReporteEnColaVisible[];
  onDescartar: (idempotencyKey: string) => void;
  onReenviarConClaveNueva: (reporte: ReporteEnCola) => void;
  onCompletar: (
    idempotencyKey: string,
    campos: { titulo: string; severidad: Severidad | null },
  ) => Promise<ErrorAlCompletar>;
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
                {r.datos.titulo ? <strong>{r.datos.titulo} · </strong> : null}
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

              {r.visible === 'incompleto' && !enConfirmacion && (
                <CompletarReporte reporte={r} onCompletar={onCompletar} />
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

/**
 * NC-02: completar un reporte guardado por la version anterior del
 * formulario. El titulo viene sugerido («<categoría> en <distrito>») pero
 * hay que confirmarlo; la severidad no trae valor por defecto.
 */
function CompletarReporte({
  reporte,
  onCompletar,
}: {
  reporte: ReporteEnCola;
  onCompletar: (
    idempotencyKey: string,
    campos: { titulo: string; severidad: Severidad | null },
  ) => Promise<ErrorAlCompletar>;
}) {
  const sugerido = useTituloSugerido(reporte.datos);
  // `null` = el ciudadano todavia no lo toco: se muestra la sugerencia.
  const [tituloEscrito, setTitulo] = useState<string | null>(reporte.datos.titulo ?? null);
  const [severidad, setSeveridad] = useState<Severidad | null>(reporte.datos.severidad ?? null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [intentado, setIntentado] = useState(false);
  const titulo = tituloEscrito ?? sugerido ?? '';
  const id = `completar-${reporte.idempotencyKey}`;
  const errores = intentado
    ? erroresDeTituloYSeveridad(titulo, severidad)
    : { titulo: null, severidad: null };

  async function guardar(evento: React.FormEvent) {
    evento.preventDefault();
    setError(null);
    setIntentado(true);
    const campos = erroresDeTituloYSeveridad(titulo, severidad);
    if (campos.titulo || campos.severidad) return;
    setGuardando(true);
    try {
      setError(await onCompletar(reporte.idempotencyKey, { titulo, severidad }));
    } catch {
      setError('No se pudo guardar en el dispositivo. Vuelve a intentarlo.');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <form onSubmit={guardar} noValidate className="flex flex-col gap-2 border-t border-amber-200 pt-2 dark:border-amber-800">
      {/* Aviso fijo, no una alerta: ya esta en la pantalla al llegar. */}
      <p className="text-amber-900 dark:text-amber-100">{avisoDeIncompleto(reporte)}</p>
      {error && (
        <p role="alert" className="text-red-700 dark:text-red-300">
          {error}
        </p>
      )}
      <CampoTitulo
        id={`${id}-titulo`}
        valor={titulo}
        onCambiar={setTitulo}
        error={errores.titulo}
      />
      <CampoSeveridad
        nombre={`${id}-severidad`}
        valor={severidad}
        onCambiar={setSeveridad}
        error={errores.severidad}
      />
      <button
        type="submit"
        disabled={guardando}
        className="self-start rounded-md bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-60"
      >
        {guardando ? 'Guardando…' : 'Completar'}
      </button>
    </form>
  );
}

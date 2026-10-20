'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { AlertaError } from '@/components/ui/form';
import type { EstadoConsentimientos } from '../hooks/useConsentimientos';
import {
  estadoDeConsentimiento,
  etiquetaDeFinalidad,
  FINALIDADES_OPCIONALES,
  TEXTO_DE_FINALIDAD,
  TEXTO_TERMINOS_NO_REVOCABLES,
  vigenteDe,
} from '../model/consentimientos';
import { RUTA_PRIVACIDAD } from '../model/rutas';

interface Props {
  consentimientos: EstadoConsentimientos;
}

/**
 * NC-07b (D-12), perfil: consentimientos vigentes, su historial y las
 * acciones de otorgar y revocar los avisos opcionales (correo y push). Los
 * terminos no se revocan aqui: retirarlos es la baja de la cuenta.
 */
export function PrivacidadYConsentimientos({ consentimientos }: Props) {
  const { carga, procesando, error, otorgar, revocar } = consentimientos;

  return (
    <section
      aria-labelledby="titulo-privacidad"
      className="flex flex-col gap-3 border-t border-slate-200 pt-4 dark:border-slate-700"
    >
      <h2 id="titulo-privacidad" className="text-sm font-semibold text-slate-900 dark:text-slate-100">
        Privacidad y consentimientos
      </h2>

      {carga.estado === 'cargando' && <p className="text-sm text-slate-500">Cargando…</p>}
      {carga.estado === 'error' && (
        <AlertaError mensaje={carga.error.mensaje} detalles={carga.error.detalles} />
      )}
      {error && <AlertaError mensaje={error.mensaje} detalles={error.detalles} />}

      {carga.datos && (
        <>
          <Fila titulo={etiquetaDeFinalidad('TERMINOS_Y_PRIVACIDAD')}>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              {textoDeVigencia(vigenteDe(carga.datos, 'TERMINOS_Y_PRIVACIDAD'))}{' '}
              <Link
                href={RUTA_PRIVACIDAD}
                target="_blank"
                className="text-sky-700 hover:underline dark:text-sky-400"
              >
                Leer el texto
              </Link>
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">{TEXTO_TERMINOS_NO_REVOCABLES}</p>
          </Fila>

          {FINALIDADES_OPCIONALES.map((finalidad) => {
            const vigente = vigenteDe(carga.datos, finalidad);
            const ocupado = procesando === finalidad;
            return (
              <Fila key={finalidad} titulo={etiquetaDeFinalidad(finalidad)}>
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  {TEXTO_DE_FINALIDAD[finalidad]}
                </p>
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-xs text-slate-700 dark:text-slate-300">
                    {textoDeVigencia(vigente)}
                  </span>
                  <button
                    type="button"
                    disabled={ocupado}
                    onClick={() => {
                      if (vigente) void revocar(finalidad);
                      else void otorgar(finalidad);
                    }}
                    className="rounded-md border border-slate-300 px-3 py-1 text-xs text-slate-700 hover:bg-slate-100
                               disabled:opacity-60 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700"
                  >
                    {ocupado ? 'Guardando…' : vigente ? 'Retirar consentimiento' : 'Otorgar consentimiento'}
                  </button>
                </div>
              </Fila>
            );
          })}

          {carga.datos.historial.length > 0 && (
            <details className="text-xs text-slate-600 dark:text-slate-400">
              <summary className="cursor-pointer text-slate-700 dark:text-slate-300">
                Historial de consentimientos
              </summary>
              <ul className="mt-2 flex flex-col gap-1">
                {carga.datos.historial.map((c) => (
                  <li key={c.id}>
                    <strong>{etiquetaDeFinalidad(c.finalidad)}</strong> · versión{' '}
                    <code className="font-mono">{c.versionDocumento}</code> · aceptado el{' '}
                    {fecha(c.aceptadoEn)}
                    {c.revocadoEn && <> · retirado el {fecha(c.revocadoEn)}</>} ·{' '}
                    {estadoDeConsentimiento(c)}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </section>
  );
}

function Fila({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5 rounded-md border border-slate-200 p-3 dark:border-slate-700">
      <h3 className="text-sm font-medium text-slate-800 dark:text-slate-100">{titulo}</h3>
      {children}
    </div>
  );
}

function textoDeVigencia(vigente: { versionDocumento: string; aceptadoEn: string } | null): string {
  if (!vigente) return 'No otorgado.';
  return `Otorgado el ${fecha(vigente.aceptadoEn)} (versión ${vigente.versionDocumento}).`;
}

function fecha(iso: string): string {
  return iso ? new Date(iso).toLocaleString('es-PE', { dateStyle: 'medium', timeStyle: 'short' }) : '—';
}

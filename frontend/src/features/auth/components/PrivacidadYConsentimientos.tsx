'use client';

import type { ReactNode } from 'react';
import { EnlaceConDialogo } from '@/components/ui/dialogo';
import { clasesDeBoton } from '@/components/ui/Boton';
import { AlertaError } from '@/components/ui/form';
import type { EstadoConsentimientos } from '../hooks/useConsentimientos';
import {
  estadoDeConsentimiento,
  etiquetaDeFinalidad,
  FINALIDADES_OPCIONALES,
  TEXTO_DE_FINALIDAD,
  TEXTO_TERMINOS_NO_REVOCABLES,
  vigenteDe,
  type FinalidadOpcional,
} from '../model/consentimientos';
import { RUTA_PRIVACIDAD } from '../model/rutas';
import { TITULO_TERMINOS } from '../model/terminos';

interface Props {
  consentimientos: EstadoConsentimientos;
  /**
   * El texto legal, que se lee en un dialogo como en el registro (lo compone
   * la pagina: es de la feature `legal`). Navegar a `/privacidad` haria
   * perder lo que se este editando en el perfil.
   */
  textoLegal: ReactNode;
  /**
   * Revocar en lugar de `consentimientos.revocar`. US-21: el perfil lo usa
   * para que retirar el consentimiento push cancele tambien la suscripcion
   * de este navegador.
   */
  revocar?: (finalidad: FinalidadOpcional) => Promise<unknown>;
  /** Contenido bajo una finalidad (US-21: activar push en este navegador). */
  extra?: Partial<Record<FinalidadOpcional, ReactNode>>;
}

/**
 * NC-07b (D-12), perfil: consentimientos vigentes, su historial y las
 * acciones de otorgar y revocar los avisos opcionales (correo y push). Los
 * terminos no se revocan aqui: retirarlos es la baja de la cuenta.
 */
export function PrivacidadYConsentimientos({
  consentimientos,
  textoLegal,
  revocar: revocarOtro,
  extra = {},
}: Props) {
  const { carga, procesando, error, otorgar } = consentimientos;
  const revocar = revocarOtro ?? consentimientos.revocar;

  return (
    <section
      aria-labelledby="titulo-privacidad"
      className="flex flex-col gap-3 border-t border-linea pt-4"
    >
      <h2 id="titulo-privacidad" className="text-sm font-semibold text-texto">
        Privacidad y consentimientos
      </h2>

      {carga.estado === 'cargando' && <p className="text-sm text-texto-2">Cargando…</p>}
      {carga.estado === 'error' && (
        <AlertaError mensaje={carga.error.mensaje} detalles={carga.error.detalles} />
      )}
      {error && <AlertaError mensaje={error.mensaje} detalles={error.detalles} />}

      {carga.datos && (
        <>
          <Fila titulo={etiquetaDeFinalidad('TERMINOS_Y_PRIVACIDAD')}>
            <p className="text-xs text-texto-2">
              {textoDeVigencia(vigenteDe(carga.datos, 'TERMINOS_Y_PRIVACIDAD'))}{' '}
              <EnlaceConDialogo
                href={RUTA_PRIVACIDAD}
                titulo={TITULO_TERMINOS}
                contenido={textoLegal}
                className="text-enlace hover:underline"
              >
                Leer el texto
              </EnlaceConDialogo>
            </p>
            <p className="text-xs text-texto-2">{TEXTO_TERMINOS_NO_REVOCABLES}</p>
          </Fila>

          {FINALIDADES_OPCIONALES.map((finalidad) => {
            const vigente = vigenteDe(carga.datos, finalidad);
            const ocupado = procesando === finalidad;
            return (
              <Fila key={finalidad} titulo={etiquetaDeFinalidad(finalidad)}>
                <p className="text-xs text-texto-2">
                  {TEXTO_DE_FINALIDAD[finalidad]}
                </p>
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-xs text-texto">
                    {textoDeVigencia(vigente)}
                  </span>
                  <button
                    type="button"
                    disabled={ocupado}
                    onClick={() => {
                      if (vigente) void revocar(finalidad);
                      else void otorgar(finalidad);
                    }}
                    className={clasesDeBoton('secundario', 'compacto')}
                  >
                    {ocupado ? 'Guardando…' : vigente ? 'Retirar consentimiento' : 'Otorgar consentimiento'}
                  </button>
                </div>
                {extra[finalidad]}
              </Fila>
            );
          })}

          {carga.datos.historial.length > 0 && (
            <details className="text-xs text-texto-2">
              <summary className="cursor-pointer text-texto">
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
    <div className="flex flex-col gap-1.5 rounded-control border border-linea p-3">
      <h3 className="text-sm font-medium text-texto">{titulo}</h3>
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

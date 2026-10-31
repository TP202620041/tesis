'use client';

import { useId, useState } from 'react';
import { AlertaError, Boton, CLASE_CONTROL_INVALIDO, CLASE_ETIQUETA, ErrorDelCampo } from '@/components/ui/form';
import type { ResultadoDeAccion } from '../hooks/useDetalleModeracion';
import { errorDeMotivoDeDesestimacion, MAX_MOTIVO_DESESTIMACION } from '../model/moderacion';

/**
 * NC-11b: desestimar las denuncias pendientes sin ocultar nada. El motivo es
 * opcional y solo lo ve el ADMIN (queda en `motivoResolucion` de cada
 * denuncia): no llega al autor ni a la municipalidad.
 */
export function DesestimarDenuncias({
  enviando,
  onDesestimar,
}: {
  enviando: boolean;
  onDesestimar: (motivo?: string) => Promise<ResultadoDeAccion>;
}) {
  const idBase = useId();
  const idMotivo = `${idBase}-motivo`;
  const idError = `${idBase}-error`;
  const [motivo, setMotivo] = useState('');
  const [errorLocal, setErrorLocal] = useState<string | null>(null);
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);

  async function enviar(evento: React.FormEvent) {
    evento.preventDefault();
    setErrorGeneral(null);
    const invalido = errorDeMotivoDeDesestimacion(motivo);
    setErrorLocal(invalido);
    if (invalido) return;
    const resultado = await onDesestimar(motivo);
    if (resultado.ok) setMotivo('');
    else if (resultado.campo === 'motivo') setErrorLocal(resultado.mensaje);
    else if (!resultado.desactualizado) setErrorGeneral(resultado.mensaje);
  }

  return (
    <form onSubmit={enviar} className="flex flex-col gap-3" noValidate>
      <h2 className="text-sm font-semibold text-texto">Desestimar las denuncias pendientes</h2>
      <p className="text-sm text-texto-2">
        El reporte y su foto siguen como están. Las denuncias pendientes pasan a desestimadas; el
        motivo es opcional y solo lo ve el equipo de Ciudad Viva.
      </p>
      {errorGeneral && <AlertaError mensaje={errorGeneral} />}
      <div className="flex flex-col gap-1.5">
        <label htmlFor={idMotivo} className={CLASE_ETIQUETA}>
          Motivo <span className="font-normal text-texto-2">(opcional)</span>
        </label>
        <textarea
          id={idMotivo}
          rows={2}
          maxLength={MAX_MOTIVO_DESESTIMACION}
          value={motivo}
          onChange={(e) => {
            setMotivo(e.target.value);
            setErrorLocal(null);
          }}
          aria-invalid={errorLocal ? true : undefined}
          aria-describedby={errorLocal ? idError : undefined}
          className={`bg-superficie text-texto rounded-control border border-linea-campo px-3 py-2 text-sm ${CLASE_CONTROL_INVALIDO}`}
        />
        {errorLocal && <ErrorDelCampo id={idError} mensaje={errorLocal} />}
      </div>
      <Boton cargando={enviando} variante="secundario">
        Desestimar denuncias
      </Boton>
    </form>
  );
}

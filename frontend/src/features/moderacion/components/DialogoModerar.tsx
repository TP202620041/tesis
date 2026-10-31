'use client';

import { useId, useState } from 'react';
import { Aviso } from '@/components/ui/Aviso';
import { Dialogo } from '@/components/ui/dialogo';
import { AlertaError, Boton, CLASE_CONTROL_INVALIDO, CLASE_ETIQUETA, ErrorDelCampo } from '@/components/ui/form';
import type { AlcanceModeracion } from '@/lib/types/domain';
import type { ResultadoDeAccion } from '../hooks/useDetalleModeracion';
import { AVISO_MOTIVO, avisoDeAlcance, errorDeMotivo, MAX_MOTIVO, tituloDeAccion } from '../model/moderacion';
import type { AccionDeModeracion, OrdenDeModeracion } from '../model/tipos';

/**
 * NC-11b (D-15): el dialogo de ocultar o restablecer el reporte o su foto.
 *
 * - Avisa que pasa con la visibilidad y con el indice de desempeño segun el
 *   alcance (`avisoDeAlcance`): con `REPORTE` sale del indice; con `FOTO` el
 *   indice no cambia.
 * - Junto al motivo, en ocultar y en restablecer, el aviso fijo decidido por
 *   el usuario (`AVISO_MOTIVO`): el autor y la municipalidad lo leeran; no
 *   nombrar a quien denuncio ni decir cuantas denuncias hubo.
 * - El 400 `MOTIVO_IDENTIFICA_DENUNCIANTE` va en el campo del motivo; un 409
 *   del estado (`YA_OCULTO`…) cierra el dialogo, y la pantalla lo avisa.
 *
 * Se monta solo mientras esta abierto: cada vez arranca con el motivo vacio.
 */
export function DialogoModerar({
  accion,
  alcance,
  abierto,
  alCerrar,
  onConfirmar,
}: {
  accion: AccionDeModeracion;
  alcance: AlcanceModeracion;
  abierto: boolean;
  alCerrar: () => void;
  onConfirmar: (orden: OrdenDeModeracion) => Promise<ResultadoDeAccion>;
}) {
  const titulo = tituloDeAccion(accion, alcance);
  return (
    <Dialogo abierto={abierto} alCerrar={alCerrar} titulo={titulo}>
      {abierto && (
        <FormularioDeMotivo
          accion={accion}
          alcance={alcance}
          alCerrar={alCerrar}
          onConfirmar={onConfirmar}
        />
      )}
    </Dialogo>
  );
}

function FormularioDeMotivo({
  accion,
  alcance,
  alCerrar,
  onConfirmar,
}: {
  accion: AccionDeModeracion;
  alcance: AlcanceModeracion;
  alCerrar: () => void;
  onConfirmar: (orden: OrdenDeModeracion) => Promise<ResultadoDeAccion>;
}) {
  const idBase = useId();
  const idMotivo = `${idBase}-motivo`;
  const idAviso = `${idBase}-aviso`;
  const idError = `${idBase}-error`;
  const [motivo, setMotivo] = useState('');
  const [enviando, setEnviando] = useState(false);
  // El motivo que el servidor rechazo: el error se queda mientras no cambie.
  const [rechazo, setRechazo] = useState<{ motivo: string; mensaje: string } | null>(null);
  const [errorLocal, setErrorLocal] = useState<string | null>(null);
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);

  const errorEnCampo = errorLocal ?? (rechazo && rechazo.motivo === motivo ? rechazo.mensaje : null);

  async function enviar(evento: React.FormEvent) {
    evento.preventDefault();
    setErrorGeneral(null);
    const invalido = errorDeMotivo(motivo);
    setErrorLocal(invalido);
    if (invalido) return;
    setEnviando(true);
    try {
      const resultado = await onConfirmar({ alcance, motivo: motivo.trim() });
      if (resultado.ok) {
        alCerrar();
        return;
      }
      if (resultado.campo === 'motivo') {
        setRechazo({ motivo, mensaje: resultado.mensaje });
      } else if (resultado.desactualizado) {
        // El estado del reporte ya no es el que se veia: la pantalla lo
        // explica y se recarga; el dialogo ya no tiene sentido.
        alCerrar();
      } else {
        setErrorGeneral(resultado.mensaje);
      }
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={enviar} className="flex flex-col gap-4" noValidate>
      <Aviso tono={accion === 'ocultar' && alcance === 'REPORTE' ? 'advertencia' : 'info'}>
        <p>{avisoDeAlcance(accion, alcance)}</p>
      </Aviso>

      {errorGeneral && <AlertaError mensaje={errorGeneral} />}

      <div className="flex flex-col gap-1.5">
        <label htmlFor={idMotivo} className={CLASE_ETIQUETA}>
          Motivo
        </label>
        {/* Decision del usuario (30/10): el aviso va junto al campo y lo describe. */}
        <p id={idAviso} className="text-sm font-medium text-aviso-texto">
          {AVISO_MOTIVO}
        </p>
        <textarea
          id={idMotivo}
          rows={4}
          maxLength={MAX_MOTIVO}
          value={motivo}
          onChange={(e) => {
            setMotivo(e.target.value);
            setErrorLocal(null);
          }}
          aria-invalid={errorEnCampo ? true : undefined}
          aria-describedby={[idAviso, errorEnCampo ? idError : null].filter(Boolean).join(' ')}
          placeholder="Por ejemplo: «La foto muestra la placa de un vehículo particular»."
          className={`bg-superficie text-texto rounded-control border border-linea-campo px-3 py-2 text-sm ${CLASE_CONTROL_INVALIDO}`}
        />
        {errorEnCampo && <ErrorDelCampo id={idError} mensaje={errorEnCampo} />}
        <p className="text-xs text-texto-2">
          {motivo.trim().length} / {MAX_MOTIVO} (mínimo 10)
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <Boton cargando={enviando} variante={accion === 'ocultar' ? 'peligro' : 'primario'}>
          {tituloDeAccion(accion, alcance)}
        </Boton>
        <Boton type="button" variante="secundario" onClick={alCerrar} disabled={enviando}>
          Cancelar
        </Boton>
      </div>
    </form>
  );
}

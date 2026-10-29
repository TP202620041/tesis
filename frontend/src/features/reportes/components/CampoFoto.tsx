'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { clasesDeBoton } from '@/components/ui/Boton';
import { ACEPTA_FOTO, AYUDA_DE_FOTO, errorDeFoto } from '@/lib/types/fotoParaSubir';

/**
 * Captura de la foto del daño (US-05).
 *
 * Se usa un `<input type="file">` con `capture="environment"`, no
 * `MediaDevices.getUserMedia`: en un movil, `capture` abre directamente la
 * camara trasera del sistema —con su enfoque, flash y control de
 * exposicion— y en escritorio degrada solo a un selector de archivos.
 * Construir la captura con `getUserMedia` obligaria a reimplementar la
 * previsualizacion, el disparo y el encuadre, y a pedir un permiso de camara
 * mas intrusivo, para un resultado peor en el caso de uso real (alguien
 * parado frente a un bache).
 *
 * DEP-11: el tamaño y el formato se validan al elegir, con la misma regla que
 * la foto de perfil (`lib/types/fotoParaSubir`). Una foto rechazada no llega
 * al formulario (ni a la cola offline) y el motivo se asocia al campo
 * (`aria-describedby`). Sin foto, el campo queda `aria-invalid`; si habia una
 * foto valida, se conserva y es la que se enviara, asi que el campo NO se
 * marca invalido y el aviso lo aclara ({@link AVISO_FOTO_ANTERIOR}).
 *
 * NC-04: `rechazo` es el motivo por el que el SERVIDOR rechazo la foto ya
 * elegida (el 409 de la vista previa: no es una imagen valida). Se muestra
 * junto a la foto y el campo queda `aria-invalid`, porque es la que se
 * enviaria y el reporte fallaria igual; el ciudadano la cambia o la quita.
 * `aviso` es una indicacion que se ve ANTES de elegir (que la foto se analiza
 * al elegirla): va junto a la ayuda y tambien describe el campo.
 *
 * NC-10c: `noPermitida` es el aviso de la moderacion («La foto no está
 * permitida. Toma otra.»). El formulario ya QUITO la foto, asi que se muestra
 * sin foto y describe el campo hasta que se elija otra. El campo no queda
 * `aria-invalid`: la foto es opcional y el reporte se puede enviar sin ella.
 */

const ID = 'foto';
const ID_AYUDA = `${ID}-ayuda`;
const ID_ERROR = `${ID}-error`;
const ID_RECHAZO = `${ID}-rechazo`;
const ID_AVISO = `${ID}-aviso`;
const ID_NO_PERMITIDA = `${ID}-no-permitida`;

/** Se agrega al motivo del rechazo cuando la foto ya elegida no cambia. */
const AVISO_FOTO_ANTERIOR = 'Se mantiene la foto anterior.';

interface Props {
  valor: File | null;
  onCambiar: (foto: File | null) => void;
  /** NC-04: el servidor rechazo la foto elegida (409), o `null`. */
  rechazo?: string | null;
  /** NC-04: indicacion previa a la eleccion (el analisis automatico), o nada. */
  aviso?: string;
  /** NC-10c: la moderacion rechazo la foto (ya quitada), o `null`. */
  noPermitida?: string | null;
}

export function CampoFoto({ valor, onCambiar, rechazo = null, aviso, noPermitida = null }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  // La previsualizacion es valor DERIVADO de la foto, no estado propio: se
  // calcula al renderizar. El efecto solo libera la URL al cambiar de foto o
  // desmontar; sin eso el navegador retiene el blob toda la sesion.
  const previsualizacion = useMemo(
    () => (valor ? URL.createObjectURL(valor) : null),
    [valor],
  );

  useEffect(() => {
    if (!previsualizacion) return;
    return () => URL.revokeObjectURL(previsualizacion);
  }, [previsualizacion]);

  function seleccionar(input: HTMLInputElement) {
    const archivo = input.files?.[0];
    setError(null);
    if (!archivo) {
      onCambiar(null);
      return;
    }
    const motivo = errorDeFoto(archivo);
    if (motivo) {
      setError(motivo);
      // Sin esto, volver a elegir el mismo archivo no dispararia `change`.
      input.value = '';
      return;
    }
    onCambiar(archivo);
  }

  const rechazada = rechazo != null && valor != null;
  const descripcion = [
    error ? ID_ERROR : null,
    rechazada ? ID_RECHAZO : null,
    noPermitida ? ID_NO_PERMITIDA : null,
    ID_AYUDA,
    aviso ? ID_AVISO : null,
  ]
    .filter(Boolean)
    .join(' ');
  // Con una foto valida conservada, el rechazo fue de la nueva eleccion: lo
  // que se enviara es valido. Si el servidor rechazo la conservada, no.
  const invalido = (error != null && valor == null) || rechazada;

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={ID} className="text-sm font-medium text-texto">
        Foto del daño <span className="font-normal text-texto-2">(opcional)</span>
      </label>

      <input
        ref={inputRef}
        id={ID}
        type="file"
        accept={ACEPTA_FOTO}
        capture="environment"
        aria-invalid={invalido ? true : undefined}
        aria-describedby={descripcion}
        className="sr-only"
        onChange={(e) => seleccionar(e.currentTarget)}
      />

      {previsualizacion ? (
        <div className="flex flex-col gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={previsualizacion}
            alt="Vista previa de la foto seleccionada"
            className="max-h-56 w-full rounded-control border border-linea-campo object-cover"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              aria-describedby={descripcion}
              className={clasesDeBoton('secundario', 'compacto')}
            >
              Cambiar
            </button>
            <button
              type="button"
              onClick={() => {
                onCambiar(null);
                setError(null);
                if (inputRef.current) inputRef.current.value = '';
              }}
              className={clasesDeBoton('secundario', 'compacto')}
            >
              Quitar
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          aria-describedby={descripcion}
          className="rounded-control border-2 border-dashed border-linea-campo px-4 py-6 text-sm
                     text-texto-2 transition hover:border-primario hover:text-enlace"
        >
          Tomar o elegir una foto
        </button>
      )}

      <p id={ID_AYUDA} className="text-xs text-texto-2">
        {AYUDA_DE_FOTO}
      </p>

      {aviso && (
        <p id={ID_AVISO} className="text-xs text-texto-2">
          {aviso}
        </p>
      )}

      {error && (
        <p id={ID_ERROR} role="alert" className="text-sm text-error">
          {valor ? `${error} ${AVISO_FOTO_ANTERIOR}` : error}
        </p>
      )}

      {rechazada && (
        <p id={ID_RECHAZO} role="alert" className="text-sm text-error">
          {rechazo}
        </p>
      )}

      {noPermitida && (
        <p id={ID_NO_PERMITIDA} role="alert" className="text-sm font-medium text-error">
          {noPermitida}
        </p>
      )}
    </div>
  );
}

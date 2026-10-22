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
 * al formulario (ni a la cola offline): queda la anterior, si la habia, y el
 * motivo se asocia al campo (`aria-invalid`, `aria-describedby`).
 */

const ID = 'foto';
const ID_AYUDA = `${ID}-ayuda`;
const ID_ERROR = `${ID}-error`;

interface Props {
  valor: File | null;
  onCambiar: (foto: File | null) => void;
}

export function CampoFoto({ valor, onCambiar }: Props) {
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

  const descripcion = error ? `${ID_ERROR} ${ID_AYUDA}` : ID_AYUDA;

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
        aria-invalid={error ? true : undefined}
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

      {error && (
        <p id={ID_ERROR} role="alert" className="text-sm text-error">
          {error}
        </p>
      )}
    </div>
  );
}

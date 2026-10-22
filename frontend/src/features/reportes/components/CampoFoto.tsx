'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { clasesDeBoton } from '@/components/ui/Boton';

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
 */

const FORMATOS = ['image/jpeg', 'image/png', 'image/webp'];
const TAMANO_MAXIMO_MB = 10; // coincide con spring.servlet.multipart.max-file-size

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

  function seleccionar(archivo: File | undefined) {
    setError(null);
    if (!archivo) {
      onCambiar(null);
      return;
    }
    if (!FORMATOS.includes(archivo.type)) {
      setError('Formato no permitido. Usa JPG, PNG o WEBP.');
      return;
    }
    if (archivo.size > TAMANO_MAXIMO_MB * 1024 * 1024) {
      setError(`La foto supera ${TAMANO_MAXIMO_MB} MB.`);
      return;
    }
    onCambiar(archivo);
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium text-texto">
        Foto del daño <span className="font-normal text-texto-2">(opcional)</span>
      </span>

      <input
        ref={inputRef}
        id="foto"
        type="file"
        accept={FORMATOS.join(',')}
        capture="environment"
        className="sr-only"
        onChange={(e) => seleccionar(e.target.files?.[0])}
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
          className="rounded-control border-2 border-dashed border-linea-campo px-4 py-6 text-sm
                     text-texto-2 transition hover:border-primario hover:text-enlace"
        >
          Tomar o elegir una foto
        </button>
      )}

      {error && (
        <p role="alert" className="text-sm text-error">
          {error}
        </p>
      )}
    </div>
  );
}

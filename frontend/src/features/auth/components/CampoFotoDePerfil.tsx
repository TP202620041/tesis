'use client';

import { useEffect, useRef, useState } from 'react';
import { ACEPTA_FOTO, AYUDA_DE_FOTO, errorDeFoto } from '@/lib/types/fotoParaSubir';

/**
 * US-30: la foto de perfil que se sube con «Guardar cambios».
 *
 * DEP-11: misma regla y mismos mensajes que la foto del reporte
 * (`lib/types/fotoParaSubir`). Antes no se validaba nada: una foto de más de
 * 10 MB recibía 413 y, por encima de 32 MB, el servidor cortaba la conexión y
 * la pantalla decía «Sin conexión con el servidor». Ahora una foto rechazada
 * no queda elegida (se vacía el selector y el formulario guarda el resto sin
 * foto), y el motivo se asocia al campo (`aria-invalid`, `aria-describedby`)
 * hasta que se elija otra.
 *
 * `valor` es la foto que se enviará; cuando el formulario la limpia tras
 * guardar, el selector también se vacía para no seguir mostrándola.
 */
export function CampoFotoDePerfil({
  id,
  valor,
  onCambiar,
}: {
  id: string;
  valor: File | null;
  onCambiar: (foto: File | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const idAyuda = `${id}-ayuda`;
  const idError = `${id}-error`;

  useEffect(() => {
    if (valor === null && inputRef.current) inputRef.current.value = '';
  }, [valor]);

  function seleccionar(input: HTMLInputElement) {
    const archivo = input.files?.[0] ?? null;
    const motivo = archivo ? errorDeFoto(archivo) : null;
    setError(motivo);
    if (motivo) input.value = '';
    onCambiar(motivo ? null : archivo);
  }

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-texto">
        Foto de perfil <span className="font-normal text-texto-2">(opcional)</span>
      </label>
      <input
        ref={inputRef}
        id={id}
        type="file"
        accept={ACEPTA_FOTO}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${idError} ${idAyuda}` : idAyuda}
        onChange={(e) => seleccionar(e.currentTarget)}
        className="text-sm text-texto"
      />
      <p id={idAyuda} className="text-xs text-texto-2">
        {AYUDA_DE_FOTO}
      </p>
      {error && (
        <p id={idError} role="alert" className="text-sm text-error">
          {error}
        </p>
      )}
      {valor && <p className="text-xs text-texto-2">Se subirá: {valor.name}</p>}
    </div>
  );
}

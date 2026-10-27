'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, mensajeDeError } from '@/lib/api/errors';
import { clasificarFoto } from '../api';
import {
  ESPERA_MAXIMA_DE_SUGERENCIA_MS,
  type EstadoDeSugerencia,
} from '../model/sugerencia';

const INACTIVA: EstadoDeSugerencia = { estado: 'inactiva' };
const ANALIZANDO: EstadoDeSugerencia = { estado: 'analizando' };
const SIN_SUGERENCIA: EstadoDeSugerencia = { estado: 'lista', sugerencia: null };

/** Resultado de la vista previa de UNA foto: se descarta si la foto ya no es esa. */
interface Resultado {
  foto: File;
  estado: EstadoDeSugerencia;
}

/**
 * NC-04: la categoría que sugiere la foto del formulario (vista previa de
 * `POST /api/clasificaciones`).
 *
 * - **Una petición por foto elegida**, sin reintentos ni cola offline: sin
 *   conexión simplemente no hay sugerencia (handoff).
 * - **Sin carreras.** Una foto nueva cancela la petición de la anterior
 *   (`AbortController`), y además cada resultado va atado a SU foto: el
 *   estado se deriva comparando con la foto actual, así que una respuesta
 *   vieja que llegara igual nunca se muestra con la foto nueva.
 * - **Nunca bloquea.** Cualquier fallo (red, 5xx, 401, espera agotada) queda
 *   en «sin sugerencia». Solo el 409 se distingue: la foto no es una imagen
 *   válida y crear el reporte con ella fallaría igual.
 * - `descartar()`: el formulario la llama al enviar el reporte. Si la vista
 *   previa sigue en curso se cancela y no se muestra (el backend calcula la
 *   sugerencia oficial igual, sobre la foto guardada). Si ya había llegado,
 *   no cambia nada.
 *
 * No va sobre `useCarga`: sus dependencias se comparan por JSON (un `File`
 * serializa como `{}`, así que dos fotos distintas serían iguales), no cancela
 * la petición y traduce todo error a un mensaje, sin el `status`.
 */
export function useSugerenciaDeCategoria(foto: File | null) {
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const enCurso = useRef<{ foto: File; control: AbortController } | null>(null);

  useEffect(() => {
    if (!foto) return;
    const control = new AbortController();
    enCurso.current = { foto, control };
    const espera = setTimeout(() => control.abort(), ESPERA_MAXIMA_DE_SUGERENCIA_MS);
    // La espera agotada cancela la petición y deja «sin sugerencia»; un
    // cambio de foto o el desmontaje la cancelan sin dejar nada.
    let vigente = true;

    void clasificarFoto(foto, control.signal)
      .then(
        (sugerencia): EstadoDeSugerencia => ({ estado: 'lista', sugerencia }),
        (e: unknown): EstadoDeSugerencia =>
          e instanceof ApiError && e.status === 409
            ? { estado: 'foto-rechazada', mensaje: mensajeDeError(e).mensaje }
            : SIN_SUGERENCIA,
      )
      .then((estado) => {
        clearTimeout(espera);
        if (!vigente || enCurso.current?.control !== control) return;
        enCurso.current = null;
        setResultado({ foto, estado });
      });

    return () => {
      vigente = false;
      clearTimeout(espera);
      control.abort();
      if (enCurso.current?.control === control) enCurso.current = null;
    };
  }, [foto]);

  const descartar = useCallback(() => {
    const pendiente = enCurso.current;
    if (!pendiente) return;
    enCurso.current = null;
    pendiente.control.abort();
    setResultado({ foto: pendiente.foto, estado: INACTIVA });
  }, []);

  const estado: EstadoDeSugerencia = !foto
    ? INACTIVA
    : resultado?.foto === foto
      ? resultado.estado
      : ANALIZANDO;

  return { ...estado, descartar };
}

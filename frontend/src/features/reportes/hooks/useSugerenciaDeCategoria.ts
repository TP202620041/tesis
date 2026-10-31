'use client';

import { useCallback, useEffect, useEffectEvent, useRef, useState } from 'react';
import { ApiError, mensajeDeError } from '@/lib/api/errors';
import { clasificarFoto } from '../api';
import {
  ESPERA_MAXIMA_DE_SUGERENCIA_MS,
  type ClasificacionDeLaFoto,
  type EstadoDeSugerencia,
} from '../model/sugerencia';

const INACTIVA: EstadoDeSugerencia = { estado: 'inactiva' };
const ANALIZANDO: EstadoDeSugerencia = { estado: 'analizando' };
const SIN_SUGERENCIA: EstadoDeSugerencia = { estado: 'lista', sugerencia: null };
const FOTO_NO_PERMITIDA: EstadoDeSugerencia = { estado: 'foto-no-permitida' };

function estadoDe(clasificacion: ClasificacionDeLaFoto): EstadoDeSugerencia {
  return clasificacion.fotoNoPermitida
    ? FOTO_NO_PERMITIDA
    : { estado: 'lista', sugerencia: clasificacion.sugerencia };
}

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
 * - `reanudar()`: el formulario la llama si el envío falló y el ciudadano
 *   sigue en el formulario (409, 400). Si `descartar()` había cancelado la
 *   vista previa de la foto actual, la vuelve a pedir; si no había nada
 *   cancelado (la respuesta ya había llegado) o la foto cambió entretanto, no
 *   hace nada: nunca se pide dos veces lo que ya se tiene.
 *
 * - NC-10c: si la moderación rechaza la foto (`fotoRechazada: true`), el
 *   estado es `foto-no-permitida` y se llama a `alNoPermitirLaFoto` con ESA
 *   foto, una sola vez, para que el formulario la quite. Solo con la respuesta
 *   vigente: una foto ya cambiada, una vista previa descartada o un
 *   formulario desmontado no avisan nada.
 *
 * No va sobre `useCarga`: sus dependencias se comparan por JSON (un `File`
 * serializa como `{}`, así que dos fotos distintas serían iguales), no cancela
 * la petición y traduce todo error a un mensaje, sin el `status`.
 */
export function useSugerenciaDeCategoria(
  foto: File | null,
  alNoPermitirLaFoto?: (foto: File) => void,
) {
  // Un evento del efecto: siempre llama a la versión vigente del callback sin
  // que el efecto dependa de él (si dependiera, cada render del formulario
  // volvería a pedir la vista previa).
  const avisarFotoNoPermitida = useEffectEvent((rechazada: File) => alNoPermitirLaFoto?.(rechazada));
  const [resultado, setResultado] = useState<Resultado | null>(null);
  // Sube solo con `reanudar()`: vuelve a correr el efecto con la misma foto.
  const [intento, setIntento] = useState(0);
  const enCurso = useRef<{ foto: File; control: AbortController } | null>(null);
  // Foto cuya vista previa canceló `descartar()` antes de que llegara.
  const descartada = useRef<File | null>(null);

  useEffect(() => {
    // Foto nueva (o la misma, reanudada): lo descartado antes ya no aplica.
    descartada.current = null;
    if (!foto) return;
    const control = new AbortController();
    enCurso.current = { foto, control };
    const espera = setTimeout(() => control.abort(), ESPERA_MAXIMA_DE_SUGERENCIA_MS);
    // La espera agotada cancela la petición y deja «sin sugerencia»; un
    // cambio de foto o el desmontaje la cancelan sin dejar nada.
    let vigente = true;

    void clasificarFoto(foto, control.signal)
      .then(estadoDe, (e: unknown): EstadoDeSugerencia =>
        e instanceof ApiError && e.status === 409
          ? { estado: 'foto-rechazada', mensaje: mensajeDeError(e).mensaje }
          : SIN_SUGERENCIA,
      )
      .then((estado) => {
        clearTimeout(espera);
        if (!vigente || enCurso.current?.control !== control) return;
        enCurso.current = null;
        setResultado({ foto, estado });
        if (estado.estado === 'foto-no-permitida') avisarFotoNoPermitida(foto);
      });

    return () => {
      vigente = false;
      clearTimeout(espera);
      control.abort();
      if (enCurso.current?.control === control) enCurso.current = null;
    };
  }, [foto, intento]);

  const descartar = useCallback(() => {
    const pendiente = enCurso.current;
    if (!pendiente) return;
    enCurso.current = null;
    descartada.current = pendiente.foto;
    pendiente.control.abort();
    setResultado({ foto: pendiente.foto, estado: INACTIVA });
  }, []);

  const reanudar = useCallback(() => {
    const cancelada = descartada.current;
    if (!cancelada) return;
    descartada.current = null;
    setResultado((actual) => (actual?.foto === cancelada ? null : actual));
    setIntento((n) => n + 1);
  }, []);

  const estado: EstadoDeSugerencia = !foto
    ? INACTIVA
    : resultado?.foto === foto
      ? resultado.estado
      : ANALIZANDO;

  return { ...estado, descartar, reanudar };
}

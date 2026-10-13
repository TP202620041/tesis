'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { mensajeDeError, type MensajeDeError } from '@/lib/api/errors';

export type EstadoCarga<T> =
  | { estado: 'cargando'; datos: null; error: null }
  | { estado: 'listo'; datos: T; error: null }
  | { estado: 'error'; datos: null; error: MensajeDeError };

const CARGANDO = { estado: 'cargando', datos: null, error: null } as const;

/**
 * Patrón único de carga de datos (ARCHITECTURE.md §5.5): estado
 * `cargando | listo | error`, cancelación y `recargar`. Los hooks de cada
 * feature lo envuelven (`useCarga(() => miApi(id), [id])`) y las páginas ya
 * no repiten el `useEffect` con su flag `cancelado`.
 *
 * - **Cancelación**: si cambian las dependencias o se desmonta el componente
 *   mientras una carga sigue en vuelo, su resultado se descarta. Así una
 *   respuesta lenta y vieja no pisa a una nueva.
 * - **Dependencias**: deben ser valores serializables (ids, filtros). Se
 *   comparan por su JSON, no por identidad, para que un objeto de filtros
 *   recreado en cada render no dispare cargas en bucle.
 * - **Errores**: se traducen con `mensajeDeError`. El 401 ya lo resolvió el
 *   cliente HTTP (redirige al login).
 */
export function useCarga<T>(
  cargar: () => Promise<T>,
  dependencias: readonly unknown[],
): EstadoCarga<T> & { recargar: () => void } {
  const [estado, setEstado] = useState<EstadoCarga<T>>(CARGANDO);
  const [intento, setIntento] = useState(0);
  const clave = JSON.stringify(dependencias);

  // Siempre la última función de carga, sin que cambiar su identidad (una
  // arrow nueva en cada render) vuelva a disparar la carga.
  const cargarActual = useRef(cargar);
  useEffect(() => {
    cargarActual.current = cargar;
  });

  useEffect(() => {
    let cancelado = false;
    // El estado se escribe siempre desde la función de carga, no directamente
    // en el cuerpo del efecto. `CARGANDO` sí se escribe de forma síncrona
    // (antes del primer `await`, dentro de la misma ejecución del efecto);
    // en el montaje es la misma referencia que el estado inicial y React no
    // vuelve a renderizar. `listo`/`error` se escriben tras el `await`, y
    // solo si la carga no se canceló.
    const ejecutar = async () => {
      setEstado(CARGANDO);
      try {
        const datos = await cargarActual.current();
        if (!cancelado) setEstado({ estado: 'listo', datos, error: null });
      } catch (e) {
        if (!cancelado) setEstado({ estado: 'error', datos: null, error: mensajeDeError(e) });
      }
    };
    void ejecutar();
    return () => {
      cancelado = true;
    };
  }, [clave, intento]);

  const recargar = useCallback(() => setIntento((n) => n + 1), []);

  return { ...estado, recargar };
}

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { registrarAntesDeCerrarSesion } from '@/lib/hooks/antesDeCerrarSesion';
import { useReportesEnCola } from './useColaOffline';

/**
 * US-06, dispositivo compartido: al cerrar sesion con reportes propios en la
 * cola, pregunta antes si se conservan (se enviaran cuando vuelva a entrar)
 * o se descartan. Registra un paso previo al cierre (`antesDeCerrarSesion`)
 * que espera la respuesta; sin reportes en cola no registra nada y el cierre
 * es inmediato.
 *
 * El cierre nunca queda colgado:
 * - Si el efecto se limpia o el componente se desmonta con la pregunta
 *   abierta (p. ej. la cola se vacio porque se enviaron), se responde
 *   "Conservar", que es la opcion por defecto.
 * - Un segundo intento de cierre mientras se pregunta reutiliza la MISMA
 *   espera (no deja una promesa huerfana).
 * - Responder dos veces (doble clic) no hace nada la segunda vez.
 *
 * `preguntando` es la cantidad a mostrar mientras se espera la decision.
 */
export function useConfirmacionAlCerrarSesion(usuarioId: number) {
  const { pendientes, descartarTodos } = useReportesEnCola(usuarioId);
  const [preguntando, setPreguntando] = useState<number | null>(null);
  const espera = useRef<{ promesa: Promise<void>; resolver: () => void } | null>(null);
  const cantidad = pendientes.length;

  /** Responde la pregunta abierta (si la hay) y la cierra. Idempotente. */
  const terminar = useCallback(() => {
    const actual = espera.current;
    espera.current = null;
    setPreguntando(null);
    actual?.resolver();
  }, []);

  useEffect(() => {
    if (cantidad === 0) return;
    const quitar = registrarAntesDeCerrarSesion(() => {
      if (!espera.current) {
        let resolver!: () => void;
        const promesa = new Promise<void>((r) => {
          resolver = r;
        });
        espera.current = { promesa, resolver };
        setPreguntando(cantidad);
      }
      return espera.current.promesa;
    });
    return () => {
      quitar();
      // Limpieza con la pregunta abierta = "Conservar": el cierre sigue.
      terminar();
    };
  }, [cantidad, terminar]);

  const conservar = useCallback(() => terminar(), [terminar]);
  const descartar = useCallback(async () => {
    if (!espera.current) return;
    await descartarTodos().catch(() => undefined);
    terminar();
  }, [descartarTodos, terminar]);

  return { preguntando, conservar, descartar };
}

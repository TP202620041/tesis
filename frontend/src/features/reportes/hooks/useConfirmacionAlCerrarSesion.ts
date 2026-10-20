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
 * `preguntando` es la cantidad a mostrar mientras se espera la decision.
 */
export function useConfirmacionAlCerrarSesion(usuarioId: number) {
  const { pendientes, descartarTodos } = useReportesEnCola(usuarioId);
  const [preguntando, setPreguntando] = useState<number | null>(null);
  const responder = useRef<(() => void) | null>(null);
  const cantidad = pendientes.length;

  useEffect(() => {
    if (cantidad === 0) return;
    return registrarAntesDeCerrarSesion(
      () =>
        new Promise<void>((resolver) => {
          responder.current = resolver;
          setPreguntando(cantidad);
        }),
    );
  }, [cantidad]);

  const terminar = useCallback(() => {
    setPreguntando(null);
    responder.current?.();
    responder.current = null;
  }, []);

  const conservar = useCallback(() => terminar(), [terminar]);
  const descartar = useCallback(async () => {
    await descartarTodos().catch(() => undefined);
    terminar();
  }, [descartarTodos, terminar]);

  return { preguntando, conservar, descartar };
}

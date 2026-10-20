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
 * - Si la cola se vacia (p. ej. se enviaron) o el componente se desmonta con
 *   la pregunta abierta, se responde "Conservar", que es la opcion por
 *   defecto. Que la cantidad solo baje (de 2 a 1) NO responde por el
 *   usuario: el dialogo sigue abierto con el numero actualizado.
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
  const hayPendientes = cantidad > 0;
  // La cantidad se lee de un ref: que cambie (p. ej. de 2 a 1 porque se envio
  // uno) no debe volver a registrar la guarda ni responder por el usuario.
  const cantidadActual = useRef(cantidad);
  useEffect(() => {
    cantidadActual.current = cantidad;
    // Con la pregunta abierta, el numero mostrado sigue a la cola.
    if (espera.current && cantidad > 0) setPreguntando(cantidad);
  }, [cantidad]);

  /** Responde la pregunta abierta (si la hay) y la cierra. Idempotente. */
  const terminar = useCallback(() => {
    const actual = espera.current;
    espera.current = null;
    setPreguntando(null);
    actual?.resolver();
  }, []);

  useEffect(() => {
    if (!hayPendientes) return;
    const quitar = registrarAntesDeCerrarSesion(() => {
      if (!espera.current) {
        let resolver!: () => void;
        const promesa = new Promise<void>((r) => {
          resolver = r;
        });
        espera.current = { promesa, resolver };
        setPreguntando(cantidadActual.current);
      }
      return espera.current.promesa;
    });
    return () => {
      quitar();
      // Solo llega aqui si la cola se vacio o el componente se desmonta: con
      // la pregunta abierta se responde "Conservar" y el cierre sigue.
      terminar();
    };
  }, [hayPendientes, terminar]);

  const conservar = useCallback(() => terminar(), [terminar]);
  const descartar = useCallback(async () => {
    if (!espera.current) return;
    await descartarTodos().catch(() => undefined);
    terminar();
  }, [descartarTodos, terminar]);

  return { preguntando, conservar, descartar };
}

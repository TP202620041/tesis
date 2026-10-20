'use client';

import { useCallback, useEffect } from 'react';
import { useCarga } from '@/lib/hooks/useCarga';
import { colaDeReportes } from '@/pwa/colaReportes';
import { pendientesDe, type ReporteEnCola } from '../model/colaOffline';
import type { NuevoReporte } from '../model/tipos';
import { descartarDeLaCola, encolarReporte, sincronizarCola } from './colaDeReportes';

/** Cada cuanto se reintenta mientras quedan reportes pendientes (ms). */
export const INTERVALO_DE_REINTENTO = 30_000;

const NINGUNO: ReporteEnCola[] = [];

/** Lee la cola y la vuelve a leer en cada cambio (encolar, enviar, descartar). */
function useCola<T>(seleccionar: (cola: ReporteEnCola[]) => T, dependencias: readonly unknown[]) {
  const carga = useCarga<T>(
    async () => seleccionar(await colaDeReportes.listar().catch(() => NINGUNO)),
    dependencias,
  );
  const { recargar } = carga;
  useEffect(() => colaDeReportes.suscribir(recargar), [recargar]);
  return carga.datos;
}

/**
 * US-06: reportes de `usuarioId` guardados en el dispositivo que todavia no
 * llegaron al backend ("Pendiente de envío"), y la accion de descartar uno.
 */
export function useReportesEnCola(usuarioId: number) {
  const pendientes = useCola((cola) => pendientesDe(cola, usuarioId), [usuarioId]) ?? NINGUNO;
  const descartar = useCallback((clave: string) => descartarDeLaCola(clave), []);
  return { pendientes, descartar };
}

/** `true` si hay algun reporte en cola, de cualquier usuario del dispositivo. */
export function useHayReportesEnCola(): boolean {
  return useCola((cola) => cola.length > 0, []) ?? false;
}

/** US-06: guarda un reporte que no se pudo enviar por falta de red. */
export function useEncolarReporte(usuarioId: number) {
  return useCallback((nuevo: NuevoReporte) => encolarReporte(nuevo, usuarioId), [usuarioId]);
}

/**
 * US-06: reenvia sola la cola de `usuarioId` al montarse, al volver la
 * conexion (`online`), al volver a la pestaña y cada
 * {@link INTERVALO_DE_REINTENTO} mientras queden pendientes. Con `null` (sin
 * sesion de ciudadano) no hace nada.
 */
export function useSincronizacionAutomatica(usuarioId: number | null) {
  const hayPendientes =
    useCola(
      (cola) =>
        usuarioId != null &&
        pendientesDe(cola, usuarioId).some((r) => r.estado === 'pendiente'),
      [usuarioId],
    ) ?? false;

  useEffect(() => {
    if (usuarioId == null || !hayPendientes) return;
    const intentar = () => {
      void sincronizarCola(usuarioId).catch(() => {
        // Un fallo inesperado no debe romper la pantalla: se reintenta luego.
      });
    };
    const alVolverALaPestana = () => {
      if (document.visibilityState === 'visible') intentar();
    };

    intentar();
    window.addEventListener('online', intentar);
    document.addEventListener('visibilitychange', alVolverALaPestana);
    const intervalo = window.setInterval(intentar, INTERVALO_DE_REINTENTO);
    return () => {
      window.removeEventListener('online', intentar);
      document.removeEventListener('visibilitychange', alVolverALaPestana);
      window.clearInterval(intervalo);
    };
  }, [usuarioId, hayPendientes]);
}

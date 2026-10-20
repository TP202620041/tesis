'use client';

import { useEffect, useRef, useSyncExternalStore } from 'react';
import { useCarga } from '@/lib/hooks/useCarga';
import {
  generacionDeSesion,
  haySesion,
  suscribirCambiosDeSesion,
} from '@/lib/auth/token-storage';
import type { Usuario } from '@/lib/types/domain';
import { usuarioActualSinRedirigir } from '../api';

/** Reintentos de `/me` tras un fallo que no es 401 (red, 5xx): 2 s, 4 s, 8 s, 16 s, 30 s. */
export const MAXIMO_DE_REINTENTOS = 5;
const ESPERA_INICIAL_MS = 2_000;
const ESPERA_MAXIMA_MS = 30_000;

/** Generacion de sesion como estado de React: cambia al iniciar o cerrar sesion. */
function useGeneracionDeSesion(): number {
  return useSyncExternalStore(suscribirCambiosDeSesion, generacionDeSesion, () => 0);
}

/** `true` si hay token guardado; se actualiza al iniciar o cerrar sesion (en cualquier pestaña). */
export function useHaySesion(): boolean {
  useGeneracionDeSesion();
  return haySesion();
}

/** Usuario identificado y la generacion de sesion en la que se identifico. */
export interface IdentidadEnSegundoPlano {
  usuario: Usuario;
  /**
   * Generacion de sesion tomada ANTES de preguntar a `/me`. Quien actue en
   * nombre de este usuario la compara con la actual: si difiere, la sesion
   * ya no es la que se identifico.
   */
  generacion: number;
}

/**
 * Identidad de la sesion para tareas en segundo plano (US-06), sin llevar
 * nunca al login. Consulta `/me` una vez por sesion, no en cada navegacion.
 *
 * - `undefined`: todavia no se sabe. Incluye "no se pudo averiguar" (sin red
 *   o 5xx): en ese caso se vuelve a preguntar al volver la conexion o la
 *   pestaña, y ademas solo, con espera creciente y hasta
 *   {@link MAXIMO_DE_REINTENTOS} veces, porque eso NO significa que no haya
 *   sesion.
 * - `null`: no hay sesion valida (sin token, o `/me` dio 401 y el token se
 *   borro).
 */
export function useIdentidadEnSegundoPlano({
  esperaInicialMs = ESPERA_INICIAL_MS,
}: { esperaInicialMs?: number } = {}): IdentidadEnSegundoPlano | null | undefined {
  const generacionActual = useGeneracionDeSesion();
  const intentos = useRef(0);
  const carga = useCarga<IdentidadEnSegundoPlano | null>(async () => {
    if (!haySesion()) return null;
    const generacion = generacionDeSesion();
    const usuario = await usuarioActualSinRedirigir();
    return usuario ? { usuario, generacion } : null;
  }, [generacionActual]);

  const { recargar } = carga;
  // Cada fallo trae un objeto de error nuevo: depender de el (y no de un
  // booleano) reprograma el reintento aunque React junte en un solo render
  // el "cargando" y el nuevo "error" de un reintento que fallo enseguida.
  const fallo = carga.error;
  useEffect(() => {
    if (carga.estado === 'listo') intentos.current = 0;
  }, [carga.estado]);

  useEffect(() => {
    if (!fallo) return;
    const reintentar = () => {
      if (document.visibilityState === 'visible') recargar();
    };
    window.addEventListener('online', recargar);
    document.addEventListener('visibilitychange', reintentar);
    // Un 5xx con la pestaña visible y en linea no dispara ninguno de esos
    // eventos: se reintenta solo, con espera creciente y un tope de intentos.
    let temporizador: ReturnType<typeof setTimeout> | undefined;
    if (intentos.current < MAXIMO_DE_REINTENTOS) {
      const espera = Math.min(esperaInicialMs * 2 ** intentos.current, ESPERA_MAXIMA_MS);
      temporizador = setTimeout(() => {
        intentos.current += 1;
        recargar();
      }, espera);
    }
    return () => {
      window.removeEventListener('online', recargar);
      document.removeEventListener('visibilitychange', reintentar);
      clearTimeout(temporizador);
    };
  }, [fallo, recargar, esperaInicialMs]);

  return carga.estado === 'listo' ? carga.datos : undefined;
}

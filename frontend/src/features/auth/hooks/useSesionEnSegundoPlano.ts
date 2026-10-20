'use client';

import { useEffect, useSyncExternalStore } from 'react';
import { useCarga } from '@/lib/hooks/useCarga';
import {
  generacionDeSesion,
  haySesion,
  suscribirCambiosDeSesion,
} from '@/lib/auth/token-storage';
import type { Usuario } from '@/lib/types/domain';
import { usuarioActualSinRedirigir } from '../api';

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
 *   pestaña, porque eso NO significa que no haya sesion.
 * - `null`: no hay sesion valida (sin token, o `/me` dio 401 y el token se
 *   borro).
 */
export function useIdentidadEnSegundoPlano(): IdentidadEnSegundoPlano | null | undefined {
  const generacionActual = useGeneracionDeSesion();
  const carga = useCarga<IdentidadEnSegundoPlano | null>(async () => {
    if (!haySesion()) return null;
    const generacion = generacionDeSesion();
    const usuario = await usuarioActualSinRedirigir();
    return usuario ? { usuario, generacion } : null;
  }, [generacionActual]);

  const { recargar } = carga;
  const fallo = carga.estado === 'error';
  useEffect(() => {
    if (!fallo) return;
    const reintentar = () => {
      if (document.visibilityState === 'visible') recargar();
    };
    window.addEventListener('online', recargar);
    document.addEventListener('visibilitychange', reintentar);
    return () => {
      window.removeEventListener('online', recargar);
      document.removeEventListener('visibilitychange', reintentar);
    };
  }, [fallo, recargar]);

  return carga.estado === 'listo' ? carga.datos : undefined;
}

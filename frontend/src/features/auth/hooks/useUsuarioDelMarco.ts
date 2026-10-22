'use client';

import { useEffect, useSyncExternalStore } from 'react';
import { useCarga } from '@/lib/hooks/useCarga';
import { generacionDeSesion, haySesion, suscribirCambiosDeSesion } from '@/lib/auth/token-storage';
import type { Usuario } from '@/lib/types/domain';
import { usuarioActualSinRedirigir } from '../api';

/** Quién mira, para dibujar la navegación (DIS-1). */
export type UsuarioDelMarco =
  | { estado: 'cargando' }
  | { estado: 'visitante' }
  | { estado: 'identificado'; usuario: Usuario }
  /** Hay sesión, pero `/me` no respondió (sin red, 5xx): no se sabe el rol. */
  | { estado: 'sin-identificar' };

const sinSuscripcion = () => () => {};

/**
 * Usuario del marco de la app (cabecera, barra inferior y menú de cuenta).
 *
 * Distinto de `useSesion` a propósito: el marco está en TODAS las pantallas,
 * también las públicas, así que **nunca lleva al login**. Usa
 * `usuarioActualSinRedirigir`: con un token vencido (401) lo borra y queda
 * como visitante, en vez de sacar de `/mapa` a quien solo miraba el mapa.
 *
 * - Pregunta `/me` una vez por sesión (el marco vive en el layout raíz y no se
 *   desmonta al navegar) y otra vez al iniciar o cerrar sesión, en esta
 *   pestaña o en otra (generación de sesión de `token-storage`).
 * - Sin red, «no sé quién eres» no es «no hay sesión»: queda
 *   `sin-identificar` y vuelve a preguntar al volver la conexión o la pestaña.
 * - Hasta montar en el navegador responde `cargando`: el servidor no ve el
 *   token, y lo que dibuje la hidratación debe coincidir con su HTML.
 */
export function useUsuarioDelMarco(): UsuarioDelMarco {
  const generacion = useSyncExternalStore(suscribirCambiosDeSesion, generacionDeSesion, () => 0);
  const montado = useSyncExternalStore(
    sinSuscripcion,
    () => true,
    () => false,
  );
  const carga = useCarga<Usuario | null>(
    () => (haySesion() ? usuarioActualSinRedirigir() : Promise.resolve(null)),
    [generacion],
  );

  const { recargar } = carga;
  const fallo = carga.estado === 'error';
  useEffect(() => {
    if (!fallo) return;
    const alVolver = () => {
      if (document.visibilityState === 'visible') recargar();
    };
    window.addEventListener('online', recargar);
    document.addEventListener('visibilitychange', alVolver);
    return () => {
      window.removeEventListener('online', recargar);
      document.removeEventListener('visibilitychange', alVolver);
    };
  }, [fallo, recargar]);

  if (!montado || carga.estado === 'cargando') return { estado: 'cargando' };
  if (carga.estado === 'error') return { estado: 'sin-identificar' };
  return carga.datos ? { estado: 'identificado', usuario: carga.datos } : { estado: 'visitante' };
}

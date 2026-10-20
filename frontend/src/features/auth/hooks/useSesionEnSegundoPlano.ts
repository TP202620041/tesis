'use client';

import { useSyncExternalStore } from 'react';
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

/**
 * Usuario de la sesion para tareas en segundo plano (US-06), sin llevar
 * nunca al login: con un token vencido el resultado es `null` (y el token se
 * borra). Consulta `/me` una sola vez por sesion, no en cada navegacion:
 * solo vuelve a preguntar cuando la sesion cambia.
 *
 * `undefined` mientras se averigua; `null` si no hay sesion valida.
 */
export function useUsuarioEnSegundoPlano(): Usuario | null | undefined {
  const generacion = useGeneracionDeSesion();
  const carga = useCarga<Usuario | null>(
    () => (haySesion() ? usuarioActualSinRedirigir() : Promise.resolve(null)),
    [generacion],
  );
  return carga.estado === 'listo' ? carga.datos : undefined;
}

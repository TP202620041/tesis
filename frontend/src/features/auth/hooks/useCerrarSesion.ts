'use client';

import { useRouter } from 'next/navigation';
import { useCallback } from 'react';
import { borrarCacheEntreOrigenes } from '@/pwa/cachesDeSesion';
import { cerrarSesion } from '../api';

/**
 * US-04: cierra la sesión y lleva al login.
 *
 * Un solo lugar para lo que antes repetía cada pantalla. Cerrar sesión es
 * solo del lado del cliente (se descarta el token, ver `cerrarSesion`); se
 * usa `replace` para que "atrás" no vuelva a una pantalla de la sesión
 * cerrada.
 *
 * Además borra la caché `cross-origin` del Service Worker (defensa en
 * profundidad: el SW ya no cachea el API, pero una versión anterior pudo
 * hacerlo). No se espera a que termine para navegar.
 */
export function useCerrarSesion(): () => void {
  const router = useRouter();
  return useCallback(() => {
    cerrarSesion();
    void borrarCacheEntreOrigenes();
    router.replace('/login');
  }, [router]);
}

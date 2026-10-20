'use client';

import { useRouter } from 'next/navigation';
import { useCallback } from 'react';
import {
  antesDeCerrarSesion,
  hayPasosAntesDeCerrarSesion,
} from '@/lib/hooks/antesDeCerrarSesion';
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
    const cerrar = () => {
      cerrarSesion();
      void borrarCacheEntreOrigenes();
      router.replace('/login');
    };
    // US-06: si otra parte de la app registro un paso previo (p. ej. preguntar
    // por reportes sin enviar), se espera a que el usuario decida. Sin pasos
    // previos el cierre es inmediato, como siempre.
    if (hayPasosAntesDeCerrarSesion()) void antesDeCerrarSesion().then(cerrar);
    else cerrar();
  }, [router]);
}

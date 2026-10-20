'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useRef } from 'react';
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
  const cerrando = useRef(false);
  return useCallback(() => {
    // Doble clic mientras se espera una pregunta previa: se ignora.
    if (cerrando.current) return;
    const cerrar = () => {
      cerrarSesion();
      void borrarCacheEntreOrigenes();
      router.replace('/login');
      cerrando.current = false;
    };
    // US-06: si otra parte de la app registro un paso previo (p. ej. preguntar
    // por reportes sin enviar), se espera a que el usuario decida (con tope:
    // nunca se cuelga). Sin pasos previos el cierre es inmediato, como siempre.
    if (hayPasosAntesDeCerrarSesion()) {
      cerrando.current = true;
      void antesDeCerrarSesion().then(cerrar);
    } else {
      cerrar();
    }
  }, [router]);
}

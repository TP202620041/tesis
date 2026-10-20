'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useRef } from 'react';
import {
  antesDeCerrarSesion,
  hayPasosAntesDeCerrarSesion,
} from '@/lib/sesion/antesDeCerrarSesion';
import { borrarCacheEntreOrigenes } from '@/pwa/cachesDeSesion';
import { cerrarSesion } from '../api';
import { bajaDePushAlCerrarSesion } from './push';

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
 *
 * US-21: antes de borrar el token (después sería 401) se da de baja la
 * suscripción push de este navegador, para que deje de recibir los avisos
 * de este usuario. Va aquí y no como paso de `antesDeCerrarSesion`: no es
 * una pregunta al usuario, debe correr después de esas preguntas y justo
 * antes de descartar el token, y si falla (o tarda más de 3 s) el cierre
 * sigue igual.
 */
export function useCerrarSesion(): () => void {
  const router = useRouter();
  const cerrando = useRef(false);
  return useCallback(() => {
    // Doble clic mientras se espera una pregunta previa o la baja de push: se ignora.
    if (cerrando.current) return;
    cerrando.current = true;
    const cerrar = async () => {
      // No lanza (ver su contrato); el `catch` es por si acaso: cerrar sesión
      // nunca puede quedar bloqueado por push.
      await bajaDePushAlCerrarSesion().catch(() => undefined);
      cerrarSesion();
      void borrarCacheEntreOrigenes();
      router.replace('/login');
      cerrando.current = false;
    };
    // US-06: si otra parte de la app registro un paso previo (p. ej. preguntar
    // por reportes sin enviar), se espera a que el usuario decida (con tope:
    // nunca se cuelga).
    if (hayPasosAntesDeCerrarSesion()) {
      void antesDeCerrarSesion().then(cerrar);
    } else {
      void cerrar();
    }
  }, [router]);
}

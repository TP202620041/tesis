'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useRef, useState } from 'react';
import { mensajeDeError, type MensajeDeError } from '@/lib/api/errors';
import {
  antesDeCerrarSesion,
  hayPasosAntesDeCerrarSesion,
} from '@/lib/sesion/antesDeCerrarSesion';
import { borrarCacheEntreOrigenes } from '@/pwa/cachesDeSesion';
import { cerrarSesion, cerrarSesionesEnTodosLosDispositivos } from '../api';
import { bajaDePushAlCerrarSesion } from './push';

/**
 * Flujo común de cierre de sesión. `revocarEnServidor`, si viene, corre
 * después de la baja de push (que necesita el token vivo) y antes de
 * descartar el token; si falla, el cierre se interrumpe (la sesión local
 * sigue) y el error se entrega a `alFallar`.
 */
function useFlujoDeCierre(
  revocarEnServidor?: () => Promise<void>,
  alFallar?: (e: unknown) => void,
): () => void {
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
      if (revocarEnServidor) {
        try {
          await revocarEnServidor();
        } catch (e) {
          cerrando.current = false;
          alFallar?.(e);
          return;
        }
      }
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
  }, [router, revocarEnServidor, alFallar]);
}

/**
 * US-04: cierra la sesión y lleva al login.
 *
 * Un solo lugar para lo que antes repetía cada pantalla. Cerrar sesión en
 * este dispositivo es solo del lado del cliente (se descarta el token, ver
 * `cerrarSesion`); se usa `replace` para que "atrás" no vuelva a una
 * pantalla de la sesión cerrada.
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
  return useFlujoDeCierre();
}

/**
 * US-04 Esc. 2: «Cerrar sesión en todos los dispositivos». El servidor
 * revoca todos los tokens de la cuenta, el de este dispositivo incluido
 * (`POST /api/auth/me/cerrar-sesiones`, 204); después se sigue el mismo
 * cierre local que `useCerrarSesion` (preguntas de la cola, baja de push,
 * caché, login).
 *
 * Si el servidor falla, la sesión local NO se cierra: el usuario creería
 * haber cerrado las demás sin que sea cierto. Se muestra el error y puede
 * reintentar. (La baja de push de este navegador ya ocurrió: se reactiva
 * desde la cuenta.)
 */
export function useCerrarSesionEnTodosLosDispositivos() {
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<MensajeDeError | null>(null);

  const revocar = useCallback(async () => {
    setEnviando(true);
    try {
      await cerrarSesionesEnTodosLosDispositivos();
    } finally {
      setEnviando(false);
    }
  }, []);
  const alFallar = useCallback((e: unknown) => setError(mensajeDeError(e)), []);
  const flujo = useFlujoDeCierre(revocar, alFallar);

  const cerrar = useCallback(() => {
    setError(null);
    flujo();
  }, [flujo]);

  return { cerrar, enviando, error };
}

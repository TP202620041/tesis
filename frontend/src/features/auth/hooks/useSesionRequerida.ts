'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { RUTA_ACEPTAR_TERMINOS, rutaAceptarTerminos } from '../model/rutas';
import { useSesion } from './useSesion';

/**
 * `useSesion` para una pantalla que exige sesion pero no un rol concreto:
 * si no la hay, reemplaza la ruta por `destino` (el login). Devuelve el
 * mismo estado; mientras redirige, la pantalla sigue viendo `anonimo` y no
 * pinta nada.
 *
 * NC-07b (D-12): con los terminos vigentes sin aceptar lleva a la pantalla
 * de aceptacion, que al terminar vuelve aqui (igual que `GuardiaDeRol`), y
 * mientras tanto la pantalla ve `cargando`. En la propia pantalla de
 * aceptacion no redirige (seria un bucle).
 *
 * Saca de las paginas el `useEffect` de redireccion que repetian `/reportar`
 * y `/sesion` (FE-05). Las areas por rol usan `GuardiaDeRol`.
 */
export function useSesionRequerida(destino: string) {
  const router = useRouter();
  const sesion = useSesion();
  const debeAceptar =
    sesion.estado === 'autenticado' &&
    sesion.usuario.debeAceptarTerminos &&
    !enLaPantallaDeAceptacion();

  useEffect(() => {
    if (sesion.estado === 'anonimo') router.replace(destino);
  }, [sesion.estado, router, destino]);

  useEffect(() => {
    if (!debeAceptar) return;
    router.replace(rutaAceptarTerminos(window.location.pathname + window.location.search));
  }, [debeAceptar, router]);

  if (debeAceptar) return { estado: 'cargando' as const, refrescar: sesion.refrescar };
  return sesion;
}

function enLaPantallaDeAceptacion(): boolean {
  return typeof window !== 'undefined' && window.location.pathname === RUTA_ACEPTAR_TERMINOS;
}

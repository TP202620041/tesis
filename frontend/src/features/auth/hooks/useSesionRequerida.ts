'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useSesion } from './useSesion';

/**
 * `useSesion` para una pantalla que exige sesion pero no un rol concreto:
 * si no la hay, reemplaza la ruta por `destino` (el login). Devuelve el
 * mismo estado; mientras redirige, la pantalla sigue viendo `anonimo` y no
 * pinta nada.
 *
 * Saca de las paginas el `useEffect` de redireccion que repetian `/reportar`
 * y `/sesion` (FE-05). Las areas por rol usan `GuardiaDeRol`.
 */
export function useSesionRequerida(destino: string) {
  const router = useRouter();
  const sesion = useSesion();

  useEffect(() => {
    if (sesion.estado === 'anonimo') router.replace(destino);
  }, [sesion.estado, router, destino]);

  return sesion;
}

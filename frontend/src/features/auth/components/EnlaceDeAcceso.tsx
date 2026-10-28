'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import type { ReactNode } from 'react';
import { conRedirect } from '../model/rutas';

const CLASES = 'font-medium text-enlace hover:underline';

/**
 * Enlace entre el login y el registro que conserva el `?redirect=` (QA-1
 * I-2): quien llego al login desde `/reportar` y elige «Regístrate» termina
 * en `/reportar`, no en la puerta de entrada generica. Desde NC-09, al
 * iniciar sesion tras confirmar el correo: «Revisa tu correo» lleva al login
 * con el mismo `?redirect=`.
 *
 * `useSearchParams` exige un limite de Suspense: la pagina lo envuelve en
 * uno cuyo respaldo es {@link EnlaceDeAccesoSinDestino}.
 */
export function EnlaceDeAcceso({ ruta, children }: { ruta: string; children: ReactNode }) {
  const searchParams = useSearchParams();
  return (
    <Link href={conRedirect(ruta, searchParams.get('redirect'))} className={CLASES}>
      {children}
    </Link>
  );
}

/** El mismo enlace sin el destino, mientras se resuelve la URL (respaldo de Suspense). */
export function EnlaceDeAccesoSinDestino({ ruta, children }: { ruta: string; children: ReactNode }) {
  return (
    <Link href={ruta} className={CLASES}>
      {children}
    </Link>
  );
}

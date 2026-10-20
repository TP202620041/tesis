'use client';

import { Suspense } from 'react';
import { AceptarTerminos } from '@/features/auth/components/AceptarTerminos';
import { useSesionRequerida } from '@/features/auth/hooks/useSesionRequerida';
import { TextoTerminosYPrivacidad } from '@/features/legal/components/TextoTerminosYPrivacidad';

/**
 * NC-07b (D-12): aceptacion de los terminos vigentes, para cualquier rol con
 * sesion. Llegan aqui el login (si `debeAceptarTerminos`), `GuardiaDeRol` y
 * el cliente HTTP ante un 403 `TERMINOS_PENDIENTES`. No usa `GuardiaDeRol`
 * porque esa guardia, justamente, redirige aqui.
 */
export default function AceptarTerminosPage() {
  return (
    // `useSearchParams` (el `?redirect=`) exige un limite de Suspense.
    <Suspense fallback={<p className="p-8 text-slate-600 dark:text-slate-400">Cargando…</p>}>
      <ConSesion />
    </Suspense>
  );
}

function ConSesion() {
  const sesion = useSesionRequerida('/login');
  if (sesion.estado !== 'autenticado') {
    return sesion.estado === 'cargando' ? (
      <p className="p-8 text-slate-600 dark:text-slate-400">Cargando…</p>
    ) : null;
  }
  return (
    <AceptarTerminos usuario={sesion.usuario} texto={<TextoTerminosYPrivacidad conTitulo={false} />} />
  );
}

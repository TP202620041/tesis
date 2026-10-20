'use client';

import { BotonCerrarSesion } from '@/features/auth/components/BotonCerrarSesion';
import { useSesionRequerida } from '@/features/auth/hooks/useSesionRequerida';
import { NuevoReporte } from '@/features/reportes/components/NuevoReporte';

/** US-05: crear un reporte de daño vial. */
export default function ReportarPage() {
  const sesion = useSesionRequerida('/login?redirect=/reportar');

  if (sesion.estado === 'cargando') {
    return <p className="p-8 text-slate-600 dark:text-slate-400">Cargando…</p>;
  }
  if (sesion.estado === 'anonimo') return null;

  return (
    <main className="mx-auto flex w-full max-w-lg flex-col gap-6 px-4 py-8">
      <BotonCerrarSesion className="self-end" />
      <NuevoReporte usuarioId={sesion.usuario.id} />
    </main>
  );
}

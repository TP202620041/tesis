'use client';

import Link from 'next/link';
import { BotonCerrarSesion } from '@/features/auth/components/BotonCerrarSesion';
import { GuardiaDeRol } from '@/features/auth/components/GuardiaDeRol';
import { NuevoReporte } from '@/features/reportes/components/NuevoReporte';

/**
 * US-05: crear un reporte de daño vial.
 *
 * Solo CIUDADANO, con la misma guardia que «Mis reportes» (QA-1 M-10): antes
 * bastaba con tener sesion, y un funcionario o el admin completaban el
 * formulario entero para recibir recien al enviar un «Acceso denegado» (el
 * backend solo deja crear reportes al ciudadano). Sin sesion, la guardia
 * lleva al login y vuelve aqui.
 */
export default function ReportarPage() {
  return (
    <GuardiaDeRol rolesPermitidos={['CIUDADANO']}>
      {(usuario) => (
        <main className="mx-auto flex w-full max-w-lg flex-col gap-6 px-4 py-8">
          {/* QA-1 E-3: antes la unica salida era «Cerrar sesión». */}
          <nav aria-label="Secciones" className="flex flex-wrap items-center justify-end gap-2">
            <Link
              href="/mis-reportes"
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm dark:border-slate-600 dark:text-slate-200"
            >
              Mis reportes
            </Link>
            <Link
              href="/mapa"
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm dark:border-slate-600 dark:text-slate-200"
            >
              Ver el mapa
            </Link>
            <BotonCerrarSesion />
          </nav>
          <NuevoReporte usuarioId={usuario.id} />
        </main>
      )}
    </GuardiaDeRol>
  );
}

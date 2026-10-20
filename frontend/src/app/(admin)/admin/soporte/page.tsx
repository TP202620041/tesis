'use client';

import { BotonCerrarSesion } from '@/features/auth/components/BotonCerrarSesion';
import { GuardiaDeRol } from '@/features/auth/components/GuardiaDeRol';
import { ROLES_AREA_ADMIN } from '@/features/auth/model/rutas';
import { BandejaSoporte } from '@/features/soporte/components/BandejaSoporte';

/**
 * US-25 Esc. 2: bandeja de soporte del ADMIN. La URL es `/admin/soporte`
 * porque `/soporte` ya es la página de soporte de cualquier usuario.
 */
export default function SoporteAdminPage() {
  return (
    <GuardiaDeRol rolesPermitidos={ROLES_AREA_ADMIN}>
      {() => (
        <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-6">
          <header className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                Tickets de soporte
              </h1>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Consultas de ciudadanos y funcionarios, las más recientes primero.
              </p>
            </div>
            <BotonCerrarSesion />
          </header>
          <BandejaSoporte />
        </main>
      )}
    </GuardiaDeRol>
  );
}

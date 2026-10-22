'use client';

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
          <header>
            <h1 className="text-2xl font-bold text-texto">Tickets de soporte</h1>
            <p className="text-sm text-texto-2">
              Consultas de ciudadanos y funcionarios, las más recientes primero.
            </p>
          </header>
          <BandejaSoporte />
        </main>
      )}
    </GuardiaDeRol>
  );
}

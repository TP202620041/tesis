'use client';

import { GuardiaDeRol } from '@/features/auth/components/GuardiaDeRol';
import { ROLES_AREA_ADMIN } from '@/features/auth/model/rutas';
import { BandejaModeracion } from '@/features/moderacion/components/BandejaModeracion';

/**
 * NC-11b (D-15): bandeja de moderacion del ADMIN. Solo ADMIN (SEC-01: la
 * municipalidad nunca oculta); el backend responde 403 a cualquier otro rol.
 */
export default function ModeracionAdminPage() {
  return (
    <GuardiaDeRol rolesPermitidos={ROLES_AREA_ADMIN}>
      {() => (
        <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-6">
          <header>
            <h1 className="text-2xl font-bold text-texto">Moderación de contenido</h1>
            <p className="text-sm text-texto-2">
              Reportes denunciados por los ciudadanos y contenido oculto. Las acciones están en el
              detalle de cada reporte.
            </p>
          </header>
          <BandejaModeracion />
        </main>
      )}
    </GuardiaDeRol>
  );
}

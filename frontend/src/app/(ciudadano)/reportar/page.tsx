'use client';

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
          <BotonCerrarSesion className="self-end" />
          <NuevoReporte usuarioId={usuario.id} />
        </main>
      )}
    </GuardiaDeRol>
  );
}

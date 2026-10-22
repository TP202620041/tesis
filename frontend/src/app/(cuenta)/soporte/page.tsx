'use client';

import { GuardiaDeRol } from '@/features/auth/components/GuardiaDeRol';
import { ROLES_CON_SESION } from '@/features/auth/model/rutas';
import { SoporteUsuario } from '@/features/soporte/components/SoporteUsuario';

/**
 * US-25: soporte para cualquier usuario autenticado (ciudadano, funcionario
 * o admin). Vive en el grupo `(cuenta)` porque no es de un rol: la guardia
 * solo exige sesión. La salida a su inicio y «Cerrar sesión» los da el marco
 * común (DIS-1).
 */
export default function SoportePage() {
  return (
    <GuardiaDeRol rolesPermitidos={ROLES_CON_SESION}>
      {() => (
        <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6">
          <header>
            <h1 className="text-2xl font-bold text-texto">Soporte</h1>
            <p className="text-sm text-texto-2">
              ¿Algo no funciona o tienes una duda sobre Ciudad Viva? Escríbenos.
            </p>
          </header>
          <SoporteUsuario />
        </main>
      )}
    </GuardiaDeRol>
  );
}

'use client';

import Link from 'next/link';
import { BotonCerrarSesion } from '@/features/auth/components/BotonCerrarSesion';
import { GuardiaDeRol } from '@/features/auth/components/GuardiaDeRol';
import { ROLES_CON_SESION, rutaInicialDe } from '@/features/auth/model/rutas';
import { SoporteUsuario } from '@/features/soporte/components/SoporteUsuario';

/**
 * US-25: soporte para cualquier usuario autenticado (ciudadano, funcionario
 * o admin). Vive en el grupo `(cuenta)` porque no es de un rol: la guardia
 * solo exige sesión.
 */
export default function SoportePage() {
  return (
    <GuardiaDeRol rolesPermitidos={ROLES_CON_SESION}>
      {(usuario) => (
        <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6">
          <header className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Soporte</h1>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                ¿Algo no funciona o tienes una duda sobre Ciudad Viva? Escríbenos.
              </p>
            </div>
            <nav className="flex flex-wrap gap-2">
              <Link
                href={rutaInicialDe(usuario.rol)}
                className="rounded-md border border-slate-300 px-3 py-1.5 text-sm dark:border-slate-600 dark:text-slate-200"
              >
                Volver a mi inicio
              </Link>
              <BotonCerrarSesion />
            </nav>
          </header>
          <SoporteUsuario />
        </main>
      )}
    </GuardiaDeRol>
  );
}

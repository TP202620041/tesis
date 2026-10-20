'use client';

import Link from 'next/link';
import { BotonCerrarSesion } from '@/features/auth/components/BotonCerrarSesion';
import { GuardiaDeRol } from '@/features/auth/components/GuardiaDeRol';
import { ROLES_AREA_MUNICIPAL } from '@/features/auth/model/rutas';
import { GestionCategorias } from '@/features/gestion/components/GestionCategorias';

/** US-29: categorías personalizadas del distrito del funcionario. */
export default function CategoriasPage() {
  return (
    <GuardiaDeRol rolesPermitidos={ROLES_AREA_MUNICIPAL}>
      {(usuario) => (
        <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6">
          <header className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                Categorías de daño
              </h1>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                {usuario.distritoNombre ?? 'Tu distrito'}
              </p>
            </div>
            <nav className="flex flex-wrap gap-2">
              <Link
                href="/bandeja"
                className="rounded-md border border-slate-300 px-3 py-1.5 text-sm dark:border-slate-600 dark:text-slate-200"
              >
                Bandeja
              </Link>
              <Link
                href="/dashboard"
                className="rounded-md border border-slate-300 px-3 py-1.5 text-sm dark:border-slate-600 dark:text-slate-200"
              >
                Dashboard del distrito
              </Link>
              <BotonCerrarSesion />
            </nav>
          </header>
          <GestionCategorias />
        </main>
      )}
    </GuardiaDeRol>
  );
}

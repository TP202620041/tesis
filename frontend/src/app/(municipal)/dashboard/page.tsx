'use client';

import Link from 'next/link';
import { GuardiaDeRol } from '@/features/auth/components/GuardiaDeRol';
import { ROLES_AREA_MUNICIPAL } from '@/features/auth/model/rutas';
import { DashboardDistrito } from '@/features/desempeno/components/DashboardDistrito';

/**
 * US-17: dashboard del distrito del funcionario. Cliente porque la guardia
 * recibe una función como hijo (igual que la bandeja).
 */
export default function DashboardPage() {
  return (
    <GuardiaDeRol rolesPermitidos={ROLES_AREA_MUNICIPAL}>
      {() => (
        <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-6">
          <header className="flex flex-wrap items-start justify-between gap-3">
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
              Dashboard del distrito
            </h1>
            <nav className="flex flex-wrap gap-2">
              <Link
                href="/bandeja"
                className="rounded-md border border-slate-300 px-3 py-1.5 text-sm dark:border-slate-600 dark:text-slate-200"
              >
                Bandeja
              </Link>
              <Link
                href="/desempeno"
                className="rounded-md border border-slate-300 px-3 py-1.5 text-sm dark:border-slate-600 dark:text-slate-200"
              >
                Índice público
              </Link>
            </nav>
          </header>
          <DashboardDistrito />
        </main>
      )}
    </GuardiaDeRol>
  );
}

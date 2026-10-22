'use client';

import { GuardiaDeRol } from '@/features/auth/components/GuardiaDeRol';
import { ROLES_AREA_MUNICIPAL } from '@/features/auth/model/rutas';
import { DashboardDistrito } from '@/features/desempeno/components/DashboardDistrito';

/**
 * US-17: dashboard del distrito del funcionario. Cliente porque la guardia
 * recibe una función como hijo (igual que la bandeja). La navegación del
 * área municipal (bandeja, categorías, soporte, índice público) es la del
 * marco común (DIS-1).
 */
export default function DashboardPage() {
  return (
    <GuardiaDeRol rolesPermitidos={ROLES_AREA_MUNICIPAL}>
      {() => (
        <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-6">
          <h1 className="text-2xl font-bold text-texto">Panel del distrito</h1>
          <DashboardDistrito />
        </main>
      )}
    </GuardiaDeRol>
  );
}

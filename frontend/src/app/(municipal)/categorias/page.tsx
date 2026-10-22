'use client';

import { GuardiaDeRol } from '@/features/auth/components/GuardiaDeRol';
import { ROLES_AREA_MUNICIPAL } from '@/features/auth/model/rutas';
import { GestionCategorias } from '@/features/gestion/components/GestionCategorias';

/** US-29: categorías personalizadas del distrito del funcionario. */
export default function CategoriasPage() {
  return (
    <GuardiaDeRol rolesPermitidos={ROLES_AREA_MUNICIPAL}>
      {(usuario) => (
        <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6">
          <header>
            <h1 className="text-2xl font-bold text-texto">Categorías de daño</h1>
            <p className="text-sm text-texto-2">{usuario.distritoNombre ?? 'Tu distrito'}</p>
          </header>
          <GestionCategorias />
        </main>
      )}
    </GuardiaDeRol>
  );
}

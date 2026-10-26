'use client';

import type { Usuario } from '@/lib/types/domain';
import { descripcionDeCuenta } from '../model/navegacion';
import { AccionesDeLaCuenta } from './AccionesDeLaCuenta';
import { SelectorDeApariencia } from './SelectorDeApariencia';

/**
 * «Mi perfil» del funcionario y del ADMIN: la pantalla de «Cuenta» del móvil
 * para quien no tiene perfil editable (US-30 es del ciudadano: el backend
 * solo le acepta a él `PATCH /api/auth/me`). Quién es, la apariencia, sus enlaces y
 * «Cerrar sesión»: lo mismo que el menú de cuenta de escritorio, como
 * pantalla.
 */
export function MiCuenta({ usuario }: { usuario: Usuario }) {
  return (
    <main className="mx-auto flex w-full max-w-lg flex-col gap-6 px-4 py-6">
      <header>
        <h1 className="text-2xl font-bold text-texto">Mi perfil</h1>
        <p className="font-semibold text-texto">{`${usuario.nombre} ${usuario.apellido}`.trim()}</p>
        <p className="text-sm text-texto-2">{descripcionDeCuenta(usuario)}</p>
        <p className="text-sm text-texto-2">{usuario.email}</p>
      </header>

      <section className="border-t border-linea pt-4">
        <SelectorDeApariencia />
      </section>

      <AccionesDeLaCuenta rol={usuario.rol} />
    </main>
  );
}

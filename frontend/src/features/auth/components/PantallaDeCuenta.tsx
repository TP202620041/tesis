'use client';

import type { ReactNode } from 'react';
import type { Rol } from '@/lib/types/domain';
import { useUsuarioDelMarco } from '../hooks/useUsuarioDelMarco';
import { BotonCerrarSesion } from './BotonCerrarSesion';
import { EditarPerfil } from './EditarPerfil';
import { GuardiaDeRol } from './GuardiaDeRol';
import { MiCuenta } from './MiCuenta';
import { SelectorDeApariencia } from './SelectorDeApariencia';

const ROLES_CON_CUENTA: readonly Rol[] = ['CIUDADANO', 'FUNCIONARIO_MUNICIPAL', 'ADMIN'];

/**
 * La pantalla de «Cuenta» (`/perfil`), para cualquier rol. El ciudadano edita
 * su perfil (US-30); el funcionario y el ADMIN, que no tienen perfil editable,
 * ven {@link MiCuenta}. Todos terminan en «Cerrar sesión».
 *
 * Sin red, «no sé quién eres» no es «no hay sesión»: `GuardiaDeRol` toma el
 * fallo de `/me` como anónimo y mandaría al login con el token todavía
 * guardado, y en el móvil no quedaría cómo salir (antes lo resolvía el menú
 * de cuenta de la barra). Por eso pregunta primero como el marco
 * (`useUsuarioDelMarco`): sin identificar, el aviso, la apariencia y «Cerrar
 * sesión», que funciona sin red.
 */
export function PantallaDeCuenta({ textoLegal }: { textoLegal: ReactNode }) {
  const quien = useUsuarioDelMarco();
  if (quien.estado === 'cargando') return <p className="p-8 text-texto-2">Cargando…</p>;
  if (quien.estado === 'sin-identificar') return <CuentaSinConexion />;
  return (
    <GuardiaDeRol rolesPermitidos={ROLES_CON_CUENTA}>
      {(u) =>
        u.rol === 'CIUDADANO' ? <EditarPerfil inicial={u} textoLegal={textoLegal} /> : <MiCuenta usuario={u} />
      }
    </GuardiaDeRol>
  );
}

function CuentaSinConexion() {
  return (
    <main className="mx-auto flex w-full max-w-lg flex-col gap-6 px-4 py-6">
      <header>
        <h1 className="text-2xl font-bold text-texto">Mi perfil</h1>
        <p role="status" className="text-sm text-texto-2">
          No se pudo cargar tu cuenta: revisa tu conexión.
        </p>
      </header>
      <section className="border-t border-linea pt-4">
        <SelectorDeApariencia />
      </section>
      <section className="border-t border-linea pt-4">
        <BotonCerrarSesion variante="menu" />
      </section>
    </main>
  );
}

'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { useSesion } from '../hooks/useSesion';
import {
  descripcionDeArea,
  puedeAcceder,
  rutaAceptarTerminos,
  rutaInicialDe,
} from '../model/rutas';
import type { Rol, Usuario } from '@/lib/types/domain';
import { clasesDeBoton } from '@/components/ui/Boton';

/**
 * Restringe un area del cliente a ciertos roles.
 *
 * NO es la autorizacion del sistema: el backend la impone con
 * `@PreAuthorize` y, en gestion municipal, con la validacion de jurisdiccion
 * por distrito. Esto es UX — evita que alguien vea cargar una pantalla que
 * terminaria en 403, y le ofrece una salida en vez de una pared.
 *
 * Sin sesion redirige al login conservando el destino, para volver ahi
 * despues de entrar.
 */
interface Props {
  rolesPermitidos: readonly Rol[];
  children: (usuario: Usuario) => ReactNode;
}

export function GuardiaDeRol({ rolesPermitidos, children }: Props) {
  const router = useRouter();
  const sesion = useSesion();
  const debeAceptar = sesion.estado === 'autenticado' && sesion.usuario.debeAceptarTerminos;

  useEffect(() => {
    if (sesion.estado !== 'anonimo' && !debeAceptar) return;
    const destino =
      typeof window !== 'undefined'
        ? window.location.pathname + window.location.search
        : '/';
    // NC-07b (D-12): con los terminos pendientes, el backend responderia 403
    // a todo lo que esta area pida; se va antes a la pantalla de aceptacion.
    router.replace(
      debeAceptar ? rutaAceptarTerminos(destino) : `/login?redirect=${encodeURIComponent(destino)}`,
    );
  }, [sesion.estado, debeAceptar, router]);

  if (sesion.estado === 'cargando') {
    return <p className="p-8 text-texto-2">Cargando…</p>;
  }
  if (sesion.estado === 'anonimo' || debeAceptar) return null;

  if (!puedeAcceder(sesion.usuario.rol, rolesPermitidos)) {
    return <AccesoDenegado usuario={sesion.usuario} rolesPermitidos={rolesPermitidos} />;
  }

  return <>{children(sesion.usuario)}</>;
}

function AccesoDenegado({
  usuario,
  rolesPermitidos,
}: {
  usuario: Usuario;
  rolesPermitidos: readonly Rol[];
}) {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-4 px-4 py-10">
      <h1 className="text-xl font-semibold text-texto">
        Esta sección no es para tu cuenta
      </h1>
      <p className="text-texto-2">
        {descripcionDeArea(rolesPermitidos)} Tu cuenta está registrada como{' '}
        <strong>{etiquetaDeRol(usuario.rol)}</strong>.
      </p>
      <Link
        href={rutaInicialDe(usuario.rol)}
        className={`${clasesDeBoton('primario')} self-start`}
      >
        Ir a mi inicio
      </Link>
    </main>
  );
}

function etiquetaDeRol(rol: Rol): string {
  switch (rol) {
    case 'CIUDADANO':
      return 'ciudadano';
    case 'FUNCIONARIO_MUNICIPAL':
      return 'funcionario municipal';
    case 'ADMIN':
      return 'administrador';
  }
}

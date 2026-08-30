'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { useSesion } from '@/features/auth/hooks';
import { puedeAcceder, rutaInicialDe } from '@/features/auth/rutas';
import type { Rol, Usuario } from '@/lib/types/domain';

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

  useEffect(() => {
    if (sesion.estado !== 'anonimo') return;
    const destino =
      typeof window !== 'undefined'
        ? window.location.pathname + window.location.search
        : '/';
    router.replace(`/login?redirect=${encodeURIComponent(destino)}`);
  }, [sesion.estado, router]);

  if (sesion.estado === 'cargando') {
    return <p className="p-8 text-slate-600 dark:text-slate-400">Cargando…</p>;
  }
  if (sesion.estado === 'anonimo') return null;

  if (!puedeAcceder(sesion.usuario.rol, rolesPermitidos)) {
    return <AccesoDenegado usuario={sesion.usuario} />;
  }

  return <>{children(sesion.usuario)}</>;
}

function AccesoDenegado({ usuario }: { usuario: Usuario }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-4 px-4">
      <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
        Esta sección no es para tu cuenta
      </h1>
      <p className="text-slate-600 dark:text-slate-400">
        La bandeja municipal es para funcionarios de una municipalidad distrital. Tu cuenta está
        registrada como <strong>{etiquetaDeRol(usuario.rol)}</strong>.
      </p>
      <Link
        href={rutaInicialDe(usuario.rol)}
        className="self-start rounded-md bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700"
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

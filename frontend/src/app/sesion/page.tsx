'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { BotonCerrarSesion } from '@/features/auth/components/BotonCerrarSesion';
import { useSesion } from '@/features/auth/hooks';

/**
 * Pantalla de verificacion del vertical slice: confirma que el token emitido
 * por el login/registro sirve para llamar a un endpoint protegido
 * (`GET /api/auth/me`) y que el routing autenticado funciona.
 *
 * Es andamiaje deliberado. Cuando existan las landings reales por rol
 * (bandeja del funcionario, mis-reportes del ciudadano), esta pantalla
 * desaparece.
 */
export default function SesionPage() {
  const router = useRouter();
  const sesion = useSesion();

  useEffect(() => {
    if (sesion.estado === 'anonimo') router.replace('/login');
  }, [sesion.estado, router]);

  if (sesion.estado === 'cargando') {
    return <p className="p-8 text-slate-600 dark:text-slate-400">Verificando sesión…</p>;
  }

  if (sesion.estado === 'anonimo') {
    return null;
  }

  const { usuario } = sesion;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col justify-center gap-6 px-4 py-10">
      <div className="rounded-lg border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-800">
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
          Sesión verificada
        </h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Datos devueltos por <code className="font-mono">GET /api/auth/me</code> usando el token
          guardado.
        </p>

        <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
          <Dato etiqueta="Nombre" valor={`${usuario.nombre} ${usuario.apellido}`} />
          <Dato etiqueta="Correo" valor={usuario.email} />
          <Dato etiqueta="Rol" valor={usuario.rol} />
          <Dato etiqueta="Notificaciones" valor={usuario.preferenciaNotificacion} />
          <Dato etiqueta="Distrito" valor={usuario.distritoNombre ?? '— sin asignar —'} />
        </dl>
      </div>

      <BotonCerrarSesion className="self-start" />
    </main>
  );
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <>
      <dt className="font-medium text-slate-500 dark:text-slate-400">{etiqueta}</dt>
      <dd className="text-slate-900 dark:text-slate-100">{valor}</dd>
    </>
  );
}

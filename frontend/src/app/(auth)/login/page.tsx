import { Suspense } from 'react';
import Link from 'next/link';
import type { Metadata } from 'next';
import { FormularioLogin } from '@/features/auth/components/FormularioLogin';

export const metadata: Metadata = {
  title: 'Iniciar sesión · ViaSegura',
};

/** US-02: inicio de sesion de ciudadano o funcionario municipal. */
export default function LoginPage() {
  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Iniciar sesión</h1>

      {/*
        `useSearchParams` (para el `?redirect=` que agrega el cliente HTTP al
        recibir un 401) obliga a un limite de Suspense: sin el, la pagina no
        puede prerenderizarse estaticamente.
      */}
      <Suspense fallback={<p className="text-sm text-slate-500">Cargando…</p>}>
        <FormularioLogin />
      </Suspense>

      <p className="text-sm text-slate-600 dark:text-slate-400">
        ¿No tienes cuenta?{' '}
        <Link href="/registro" className="font-medium text-sky-700 hover:underline dark:text-sky-400">
          Regístrate
        </Link>
      </p>
    </section>
  );
}

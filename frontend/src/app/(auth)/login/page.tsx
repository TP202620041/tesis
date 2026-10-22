import { Suspense } from 'react';
import Link from 'next/link';
import type { Metadata } from 'next';
import {
  EnlaceDeAcceso,
  EnlaceDeAccesoSinDestino,
} from '@/features/auth/components/EnlaceDeAcceso';
import { FormularioLogin } from '@/features/auth/components/FormularioLogin';

export const metadata: Metadata = {
  title: 'Iniciar sesión',
};

/** US-02: inicio de sesion de ciudadano o funcionario municipal. */
export default function LoginPage() {
  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold text-texto">Iniciar sesión</h1>

      {/*
        `useSearchParams` (para el `?redirect=` que agrega el cliente HTTP al
        recibir un 401) obliga a un limite de Suspense: sin el, la pagina no
        puede prerenderizarse estaticamente.
      */}
      <Suspense fallback={<p className="text-sm text-texto-2">Cargando…</p>}>
        <FormularioLogin />
      </Suspense>

      <p className="text-sm text-texto-2">
        <Link
          href="/recuperar-password"
          className="font-medium text-enlace hover:underline"
        >
          ¿Olvidaste tu contraseña?
        </Link>
      </p>

      <p className="text-sm text-texto-2">
        ¿No tienes cuenta?{' '}
        {/* Conserva el `?redirect=`: al crear la cuenta vuelve a donde iba. */}
        <Suspense fallback={<EnlaceDeAccesoSinDestino ruta="/registro">Regístrate</EnlaceDeAccesoSinDestino>}>
          <EnlaceDeAcceso ruta="/registro">Regístrate</EnlaceDeAcceso>
        </Suspense>
      </p>
    </section>
  );
}

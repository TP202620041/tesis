import { Suspense } from 'react';
import type { Metadata } from 'next';
import { ConfirmarCuenta } from '@/features/auth/components/ConfirmarCuenta';

export const metadata: Metadata = {
  title: 'Confirmar correo',
};

/**
 * NC-09: pagina publica del enlace de confirmacion
 * (`/confirmar-cuenta?token=…`, lo arma el backend). Sigue siendo estatica:
 * el token se lee en el cliente con `useSearchParams`, que obliga a un limite
 * de Suspense, y nunca llega al HTML del servidor. No carga recursos de
 * terceros (el token esta en la URL al llegar).
 */
export default function ConfirmarCuentaPage() {
  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold text-texto">Confirmar tu correo</h1>
      <Suspense fallback={<p className="text-sm text-texto-2">Cargando…</p>}>
        <ConfirmarCuenta />
      </Suspense>
    </section>
  );
}

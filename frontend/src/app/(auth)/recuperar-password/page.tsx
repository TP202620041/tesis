import type { Metadata } from 'next';
import { RecuperarPassword } from '@/features/auth/components/RecuperarPassword';

export const metadata: Metadata = {
  title: 'Recuperar contraseña · ViaSegura',
};

/** US-03: recuperación de contraseña con el token que llega por correo. */
export default function RecuperarPasswordPage() {
  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
        Recuperar contraseña
      </h1>
      <RecuperarPassword />
    </section>
  );
}

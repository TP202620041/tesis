import Link from 'next/link';
import type { Metadata } from 'next';
import { FormularioRegistro } from '@/features/auth/components/FormularioRegistro';
import { TextoTerminosYPrivacidad } from '@/features/legal/components/TextoTerminosYPrivacidad';

export const metadata: Metadata = {
  title: 'Crear cuenta · ViaSegura',
};

/** US-01: registro de cuenta ciudadana. */
export default function RegistroPage() {
  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Crear cuenta</h1>
      <FormularioRegistro textoLegal={<TextoTerminosYPrivacidad conTitulo={false} />} />
      <p className="text-sm text-slate-600 dark:text-slate-400">
        ¿Ya tienes cuenta?{' '}
        <Link href="/login" className="font-medium text-sky-700 hover:underline dark:text-sky-400">
          Inicia sesión
        </Link>
      </p>
    </section>
  );
}

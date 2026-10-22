import { Suspense } from 'react';
import type { Metadata } from 'next';
import {
  EnlaceDeAcceso,
  EnlaceDeAccesoSinDestino,
} from '@/features/auth/components/EnlaceDeAcceso';
import { FormularioRegistro } from '@/features/auth/components/FormularioRegistro';
import { TextoTerminosYPrivacidad } from '@/features/legal/components/TextoTerminosYPrivacidad';

export const metadata: Metadata = {
  title: 'Crear cuenta',
};

/** US-01: registro de cuenta ciudadana. */
export default function RegistroPage() {
  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Crear cuenta</h1>
      {/* `useSearchParams` (el `?redirect=` al que vuelve tras crear la
          cuenta, QA-1 I-2) obliga a un limite de Suspense, como en el login. */}
      <Suspense fallback={<p className="text-sm text-slate-500">Cargando…</p>}>
        <FormularioRegistro textoLegal={<TextoTerminosYPrivacidad conTitulo={false} />} />
      </Suspense>
      <p className="text-sm text-slate-600 dark:text-slate-400">
        ¿Ya tienes cuenta?{' '}
        <Suspense fallback={<EnlaceDeAccesoSinDestino ruta="/login">Inicia sesión</EnlaceDeAccesoSinDestino>}>
          <EnlaceDeAcceso ruta="/login">Inicia sesión</EnlaceDeAcceso>
        </Suspense>
      </p>
    </section>
  );
}

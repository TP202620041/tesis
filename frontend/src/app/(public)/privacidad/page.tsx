import type { Metadata } from 'next';
import { TextoTerminosYPrivacidad } from '@/features/legal/components/TextoTerminosYPrivacidad';

export const metadata: Metadata = {
  title: 'Términos de uso y privacidad',
};

/**
 * NC-07b (D-12): terminos de uso y politica de privacidad. PUBLICA: se
 * enlaza desde el registro, que ocurre sin sesion. La vuelta a la portada la
 * da el logo de la cabecera comun (DIS-1).
 */
export default function PrivacidadPage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6">
      <TextoTerminosYPrivacidad />
    </main>
  );
}

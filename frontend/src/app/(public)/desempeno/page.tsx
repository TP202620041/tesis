'use client';

import { Suspense } from 'react';
import { IndiceDesempeno } from '@/features/desempeno/components/IndiceDesempeno';

/**
 * US-18/US-19/US-20: indice publico de desempeno distrital.
 *
 * PUBLICA, sin sesion ni rol. Es la pieza que hace visible el proposito del
 * sistema: comparar como responde cada municipalidad a los reportes de sus
 * vecinos, con datos que los propios ciudadanos generaron.
 */
export default function DesempenoPage() {
  return (
    // La comparacion (US-19) lee `?comparar=…&categoria=…` con
    // `useSearchParams`, que exige un limite de Suspense.
    <Suspense fallback={<p className="p-8 text-slate-600 dark:text-slate-400">Cargando…</p>}>
      <IndiceDesempeno />
    </Suspense>
  );
}

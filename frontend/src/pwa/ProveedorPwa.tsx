'use client';

import { SerwistProvider } from '@serwist/next/react';
import type { ReactNode } from 'react';

/**
 * Registra el Service Worker y expone su instancia al arbol de React.
 *
 * Frontera entre la aplicacion y el modulo PWA: es lo unico que el resto de
 * la app conoce del Service Worker. La logica que corre dentro del worker
 * vive aislada en `src/pwa/sw.ts`.
 *
 * Se desactiva en desarrollo — el SW se construye en `npm run build`, asi que
 * durante `next dev` no existe `/sw.js`; ademas un SW cacheando mientras se
 * itera produce resultados confusos.
 */
export function ProveedorPwa({ children }: { children: ReactNode }) {
  return (
    <SerwistProvider
      swUrl="/sw.js"
      disable={process.env.NODE_ENV === 'development'}
      register
      reloadOnOnline
    >
      {children}
    </SerwistProvider>
  );
}

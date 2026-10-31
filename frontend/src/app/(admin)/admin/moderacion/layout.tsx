import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import { PLANTILLA_TITULO } from '../../../titulo';

/**
 * QA-1 M-8: titulo propio de la pagina (y lo que lee el anunciador de rutas
 * al navegar). Va en un layout porque la pagina es de cliente, y `metadata`
 * solo se exporta desde un componente de servidor.
 *
 * Repite la plantilla: sin ella, `/admin/moderacion/[id]` (con su propio
 * titulo) perderia el «· Ciudad Viva» (ver `app/titulo.ts`).
 */
export const metadata: Metadata = {
  title: { default: 'Moderación de contenido', template: PLANTILLA_TITULO },
};

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}

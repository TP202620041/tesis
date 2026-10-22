import type { ReactNode } from 'react';
import type { Metadata } from 'next';

/**
 * QA-1 M-8: titulo propio de la pagina (y lo que lee el anunciador de rutas
 * al navegar). Va en un layout porque la pagina es de cliente, y `metadata`
 * solo se exporta desde un componente de servidor.
 */
export const metadata: Metadata = {
  title: 'Bandeja de reportes',
};

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}

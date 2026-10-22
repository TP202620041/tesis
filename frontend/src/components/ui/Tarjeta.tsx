import type { HTMLAttributes, ReactNode } from 'react';

/** Clases de una tarjeta, para cuando el elemento ya existe (un `<li>`, un `<form>`…). */
export const CLASES_TARJETA = 'rounded-tarjeta border border-linea bg-superficie shadow-tarjeta';

interface TarjetaProps extends HTMLAttributes<HTMLElement> {
  /** Elemento que se renderiza: la tarjeta no impone semántica. */
  como?: 'div' | 'section' | 'article' | 'li' | 'aside';
  /** Relleno interior; `false` para tarjetas con contenido a sangre (tablas, fotos). */
  conRelleno?: boolean;
  children: ReactNode;
}

/** Superficie elevada (DIS-1): borde de línea, radio 12 y una sombra mínima. */
export function Tarjeta({ como: Elemento = 'div', conRelleno = true, className, children, ...props }: TarjetaProps) {
  return (
    <Elemento
      className={[CLASES_TARJETA, conRelleno ? 'p-4 sm:p-5' : '', className].filter(Boolean).join(' ')}
      {...props}
    >
      {children}
    </Elemento>
  );
}

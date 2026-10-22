import type { ComponentProps } from 'react';
import Link from 'next/link';

/**
 * Botones del sistema «Cívica» (DIS-1).
 *
 * - `primario`: la acción principal de la pantalla, en tinta. Una por vista.
 * - `secundario`: borde de control (3:1) sobre la superficie.
 * - `texto`: acción menor, sin caja (sigue midiendo 44 px de alto).
 * - `peligro`: acción destructiva (descartar, retirar), en el rojo de error.
 *
 * Todos miden al menos 44 px de alto (objetivo táctil, WCAG 2.5.5). El tamaño
 * `compacto`, para tablas y barras densas, baja a 36 px solo con un puntero
 * fino (ratón); en una pantalla táctil (`pointer: coarse`) vuelve a 44. El
 * foco lo da la regla global de `globals.css`.
 */
export type VarianteBoton = 'primario' | 'secundario' | 'texto' | 'peligro';
export type TamanoBoton = 'normal' | 'compacto';

const BASE =
  'inline-flex items-center justify-center gap-2 rounded-control font-semibold transition ' +
  'disabled:cursor-not-allowed disabled:opacity-60 aria-disabled:cursor-not-allowed aria-disabled:opacity-60';

const VARIANTES: Record<VarianteBoton, string> = {
  primario: 'bg-primario text-sobre-primario hover:bg-primario-hover',
  secundario: 'border border-linea-campo bg-superficie text-texto hover:bg-superficie-2',
  texto: 'text-enlace underline-offset-4 hover:text-enlace-hover hover:underline',
  peligro: 'border border-error bg-superficie text-error hover:bg-error-fondo',
};

const TAMANOS: Record<TamanoBoton, string> = {
  normal: 'min-h-objetivo px-4 text-base',
  compacto: 'min-h-9 px-3 text-sm pointer-coarse:min-h-objetivo',
};

/** Clases de un botón; sirven igual para un `<button>`, un `<a>` o un `<Link>`. */
export function clasesDeBoton(variante: VarianteBoton = 'primario', tamano: TamanoBoton = 'normal'): string {
  return `${BASE} ${VARIANTES[variante]} ${TAMANOS[tamano]}`;
}

type EnlaceBotonProps = ComponentProps<typeof Link> & { variante?: VarianteBoton; tamano?: TamanoBoton };

/** Enlace con aspecto de botón: navega (es un `<a>`), no ejecuta una acción. */
export function EnlaceBoton({ variante = 'primario', tamano = 'normal', className, ...props }: EnlaceBotonProps) {
  return <Link className={[clasesDeBoton(variante, tamano), className].filter(Boolean).join(' ')} {...props} />;
}

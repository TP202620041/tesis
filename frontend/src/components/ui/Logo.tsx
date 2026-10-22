import { useId } from 'react';

/** El pin de la marca, en la retícula de 40 de `docs/diseno/marca/marca-a.svg`. */
const PIN = 'M20 3C12.8 3 7 8.7 7 15.8 7 25 20 37 20 37s13-12 13-21.2C33 8.7 27.2 3 20 3Z';

interface LogoProps {
  /** Lado del símbolo en px. */
  tamano?: number;
  /** Muestra «Ciudad Viva» junto al símbolo. */
  conNombre?: boolean;
  /**
   * Nombre accesible del símbolo cuando va SIN nombre visible y nada más lo
   * nombra (p. ej. un enlace sin `aria-label`). Si se omite, es decorativo.
   */
  etiqueta?: string;
  className?: string;
}

/**
 * Logo de Ciudad Viva, dirección «Cívica» (DIS-1): un pin cruzado por una
 * calle con su línea amarilla discontinua (`docs/diseno/marca/marca-a.svg` y
 * `marca-a-oscuro.svg`). No hay dos componentes: los colores salen de
 * `--cv-marca` y `--cv-marca-calle`, que cada tema redefine (tinta sobre claro,
 * claro sobre oscuro, negro en alto contraste). Se lee a 16 px.
 *
 * El recorte de la calle usa un `clipPath` con id propio por instancia
 * (`useId`): con dos logos en la página (cabecera y menú) un id repetido haría
 * que uno dependiera del otro, y si ese quedara oculto el recorte fallaría.
 */
export function Logo({ tamano = 28, conNombre = false, etiqueta, className }: LogoProps) {
  const recorte = `pin-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const accesible = !conNombre && etiqueta;
  return (
    <span className={['inline-flex items-center gap-2.5', className].filter(Boolean).join(' ')}>
      <svg
        width={tamano}
        height={tamano}
        viewBox="0 0 40 40"
        focusable="false"
        className="shrink-0"
        {...(accesible ? { role: 'img', 'aria-label': etiqueta } : { 'aria-hidden': true })}
      >
        <defs>
          <clipPath id={recorte}>
            <path d={PIN} />
          </clipPath>
        </defs>
        <path d={PIN} style={{ fill: 'var(--cv-marca)' }} />
        <g clipPath={`url(#${recorte})`}>
          <path d="M2 27 38 7" strokeWidth={6} style={{ stroke: 'var(--cv-marca-calle)' }} />
          <path d="M2 27 38 7" stroke="#FFD43B" strokeWidth={1.6} strokeDasharray="3 2.6" />
        </g>
      </svg>
      {conNombre && (
        <span className="text-lg leading-none font-bold tracking-tight whitespace-nowrap text-texto">
          Ciudad Viva
        </span>
      )}
    </span>
  );
}

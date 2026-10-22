import type { ButtonHTMLAttributes } from 'react';
import type { LucideIcon } from 'lucide-react';

/*
 * Iconos de la interfaz: `lucide-react` (ISC). Se importa cada icono por su
 * nombre y queda empaquetado en el bundle: no se pide nada a otro origen, así
 * que la CSP no cambia. Trazo de 2 en una retícula de 24 px, como los
 * pictogramas de la propuesta (docs/diseno/, §5-A).
 *
 * Regla de accesibilidad: un icono NUNCA es el único portador del sentido.
 * Va junto a un texto (y entonces es decorativo: `aria-hidden`) o dentro de un
 * botón solo-icono que lleva su nombre en `aria-label` ({@link BotonIcono}).
 */

interface IconoProps {
  icono: LucideIcon;
  /** Lado en px. 20 por defecto (texto de 16 px); 16 en chips y textos chicos. */
  tamano?: number;
  className?: string;
  /** Grosor del trazo; 2 por defecto, 2.4 para el ítem activo de la navegación. */
  trazo?: number;
}

/** Icono decorativo: oculto para los lectores de pantalla y fuera del orden de foco. */
export function Icono({ icono: Componente, tamano = 20, className, trazo = 2 }: IconoProps) {
  return (
    <Componente
      aria-hidden="true"
      focusable="false"
      size={tamano}
      strokeWidth={trazo}
      className={['shrink-0', className].filter(Boolean).join(' ')}
    />
  );
}

interface BotonIconoProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label' | 'children'> {
  icono: LucideIcon;
  /** Nombre accesible: obligatorio, porque el botón no tiene texto visible. */
  etiqueta: string;
  tamano?: number;
}

/**
 * Botón con solo un icono (cerrar, menú…). El nombre va en `aria-label` y
 * también en `title`, que da la pista al pasar el ratón. Mide 44 × 44 px, el
 * objetivo táctil mínimo.
 */
export function BotonIcono({ icono, etiqueta, tamano = 20, className, type = 'button', ...props }: BotonIconoProps) {
  return (
    <button
      type={type}
      aria-label={etiqueta}
      title={etiqueta}
      className={[
        'inline-flex size-objetivo shrink-0 items-center justify-center rounded-control text-texto-2 transition',
        'hover:bg-superficie-2 hover:text-texto disabled:cursor-not-allowed disabled:opacity-60',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      {...props}
    >
      <Icono icono={icono} tamano={tamano} />
    </button>
  );
}

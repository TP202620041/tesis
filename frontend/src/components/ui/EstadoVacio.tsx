import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Icono } from './Icono';

interface EstadoVacioProps {
  titulo: string;
  descripcion?: ReactNode;
  icono?: LucideIcon;
  /** La acción que saca de ahí (un enlace o un botón). */
  accion?: ReactNode;
  className?: string;
}

/**
 * Lo que se ve cuando una lista no tiene nada (DIS-1): dice qué pasa y, si la
 * hay, ofrece la salida. Recuadro punteado, sin color de estado.
 */
export function EstadoVacio({ titulo, descripcion, icono, accion, className }: EstadoVacioProps) {
  return (
    <div
      className={[
        'flex flex-col items-start gap-3 rounded-tarjeta border border-dashed border-linea-campo bg-superficie p-6 sm:p-8',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {icono && (
        <span className="flex size-10 items-center justify-center rounded-full bg-superficie-2 text-texto-2">
          <Icono icono={icono} tamano={20} />
        </span>
      )}
      <p className="font-semibold text-texto">{titulo}</p>
      {descripcion && <div className="text-sm text-texto-2">{descripcion}</div>}
      {accion}
    </div>
  );
}

import { Check, Clock, Inbox, Minus, Wrench, X, type LucideIcon } from 'lucide-react';
import { estiloDeEstado, type ClaveEstado, type IconoEstado } from '@/lib/types/estados';
import { Icono } from './Icono';

const ICONOS: Record<IconoEstado, LucideIcon> = {
  reloj: Clock,
  bandeja: Inbox,
  llave: Wrench,
  visto: Check,
  equis: X,
  menos: Minus,
};

/*
 * Clases escritas enteras (no armadas con la clave) para que Tailwind las
 * encuentre al escanear el código. Fondo y texto salen de los tokens de cada
 * estado; el borde es transparente salvo en alto contraste (contorno negro) y
 * en Cancelado, que es un chip blanco con borde gris (propuesta §4).
 */
const CLASES: Record<ClaveEstado, string> = {
  pendiente: 'border-chip-borde bg-pendiente-fondo text-pendiente-texto',
  recibido: 'border-chip-borde bg-recibido-fondo text-recibido-texto',
  'en-proceso': 'border-chip-borde bg-en-proceso-fondo text-en-proceso-texto',
  resuelto: 'border-chip-borde bg-resuelto-fondo text-resuelto-texto',
  rechazado: 'border-chip-borde bg-rechazado-fondo text-rechazado-texto',
  cancelado: 'border-cancelado bg-cancelado-fondo text-cancelado-texto',
};

/** Icono de Lucide de un estado (para la línea de tiempo, leyendas…). */
export function iconoDeEstado(estado: string): LucideIcon {
  return ICONOS[estiloDeEstado(estado).icono];
}

/**
 * Chip de estado de un reporte (DIS-1): color + icono + nombre, nunca solo
 * color. Como la etiqueta de estado de GOV.UK, solo INDICA: no es un enlace
 * ni un botón. El nombre lo da el texto; el icono es decorativo.
 */
export function ChipEstado({ estado, className }: { estado: string; className?: string }) {
  const estilo = estiloDeEstado(estado);
  return (
    <span
      className={[
        'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-sm font-semibold whitespace-nowrap',
        CLASES[estilo.clave],
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <Icono icono={ICONOS[estilo.icono]} tamano={14} trazo={2.5} />
      {estilo.etiqueta}
    </span>
  );
}

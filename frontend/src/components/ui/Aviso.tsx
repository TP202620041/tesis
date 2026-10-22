import type { ReactNode } from 'react';
import { CircleAlert, CircleCheck, Info, TriangleAlert, WifiOff, type LucideIcon } from 'lucide-react';
import { Icono } from './Icono';

export type TonoAviso = 'info' | 'exito' | 'advertencia' | 'error' | 'sin-conexion';

const ESTILOS: Record<TonoAviso, { clases: string; icono: LucideIcon }> = {
  info: { clases: 'border-info-borde bg-info-fondo text-info-texto', icono: Info },
  exito: { clases: 'border-exito-borde bg-exito-fondo text-exito-texto', icono: CircleCheck },
  advertencia: { clases: 'border-aviso-borde bg-aviso-fondo text-aviso-texto', icono: TriangleAlert },
  error: { clases: 'border-error-borde bg-error-fondo text-error-texto', icono: CircleAlert },
  'sin-conexion': { clases: 'border-linea bg-superficie-2 text-texto', icono: WifiOff },
};

/** Clases de un aviso, para cuando el elemento ya existe (un `<p>` con su propio rol). */
export function clasesDeAviso(tono: TonoAviso): string {
  return `rounded-control border px-3 py-2 text-sm ${ESTILOS[tono].clases}`;
}

interface AvisoProps {
  tono?: TonoAviso;
  titulo?: string;
  /**
   * Rol ARIA. `alert` solo para un error que el usuario provocó y debe oír ya;
   * `status` para un cambio que se anuncia sin interrumpir. Sin rol (por
   * defecto) es texto fijo: un aviso que ya estaba al cargar no se anuncia.
   */
  rol?: 'alert' | 'status';
  className?: string;
  children: ReactNode;
}

/**
 * Aviso en línea (DIS-1): información, éxito, advertencia, error o sin
 * conexión. El tono se dice con el icono y el texto, no solo con el color.
 */
export function Aviso({ tono = 'info', titulo, rol, className, children }: AvisoProps) {
  const { icono } = ESTILOS[tono];
  return (
    <div role={rol} className={['flex items-start gap-2', clasesDeAviso(tono), className].filter(Boolean).join(' ')}>
      <Icono icono={icono} tamano={18} className="mt-px" />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {titulo && <p className="font-semibold">{titulo}</p>}
        {children}
      </div>
    </div>
  );
}

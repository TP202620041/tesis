'use client';

import { LogOut } from 'lucide-react';
import { clasesDeBoton } from '@/components/ui/Boton';
import { Icono } from '@/components/ui/Icono';
import { useCerrarSesion } from '../hooks/useCerrarSesion';

/**
 * US-04: botón de cerrar sesión, el mismo en todas las vistas con sesión.
 *
 * DIS-1: vive en el menú de cuenta (`variante="menu"`), no en cada cabecera,
 * para que no compita con las acciones de la pantalla. Conserva el flujo de
 * `useCerrarSesion`: las preguntas de `antesDeCerrarSesion` (reportes en
 * cola), la baja de push y la navegación al login.
 *
 * `alActivar` corre ANTES de empezar el cierre: el menú lo usa para cerrarse,
 * así una pregunta previa (el diálogo de reportes en cola) no queda encima de
 * un menú abierto que también escucha Escape y que tenía el foco.
 */
export function BotonCerrarSesion({
  className = '',
  variante = 'boton',
  alActivar,
}: {
  className?: string;
  variante?: 'boton' | 'menu';
  alActivar?: () => void;
}) {
  const cerrar = useCerrarSesion();
  const clases =
    variante === 'menu'
      ? 'flex min-h-objetivo w-full items-center gap-3 rounded-control px-3 text-left font-semibold text-texto hover:bg-superficie-2'
      : clasesDeBoton('secundario', 'compacto');
  return (
    <button
      type="button"
      onClick={() => {
        alActivar?.();
        cerrar();
      }}
      className={`${clases} ${className}`.trim()}
    >
      {variante === 'menu' && <Icono icono={LogOut} tamano={18} />}
      Cerrar sesión
    </button>
  );
}

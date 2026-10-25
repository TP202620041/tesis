'use client';

import Link from 'next/link';
import { useId } from 'react';
import { ChevronRight } from 'lucide-react';
import { Icono } from '@/components/ui/Icono';
import type { Rol } from '@/lib/types/domain';
import { enlacesDeLaPantallaDeCuenta } from '../model/navegacion';
import { BotonCerrarSesion } from './BotonCerrarSesion';
import { ICONOS_DE_NAVEGACION } from './iconosDeNavegacion';

/**
 * El final de la pantalla de la cuenta (`/perfil`, «Cuenta» en el móvil): los
 * enlaces de la cuenta del rol (Soporte…) y «Cerrar sesión». En el móvil no
 * hay menú de cuenta, así que es lo que lo reemplaza (prueba en iPhone del
 * 23/10); en escritorio repite el menú de la cabecera, a propósito.
 */
export function AccionesDeLaCuenta({ rol }: { rol: Rol }) {
  const titulo = useId();
  const enlaces = enlacesDeLaPantallaDeCuenta(rol);
  return (
    <section aria-labelledby={titulo} className="flex flex-col gap-1 border-t border-linea pt-4">
      <h2 id={titulo} className="text-sm font-semibold text-texto">
        Otras opciones
      </h2>
      {enlaces.length > 0 && (
        <ul className="flex flex-col">
          {enlaces.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                className="flex min-h-objetivo items-center gap-3 rounded-control px-3 font-semibold text-texto hover:bg-superficie-2"
              >
                <Icono icono={ICONOS_DE_NAVEGACION[item.icono]} tamano={18} />
                <span className="flex-1">{item.etiqueta}</span>
                <Icono icono={ChevronRight} tamano={18} className="text-texto-2" />
              </Link>
            </li>
          ))}
        </ul>
      )}
      <BotonCerrarSesion variante="menu" />
    </section>
  );
}

'use client';

import { useId } from 'react';
import { Contrast, Monitor, Moon, Sun, type LucideIcon } from 'lucide-react';
import { Icono } from '@/components/ui/Icono';
import { OPCIONES_DE_APARIENCIA, type Apariencia } from '../model/apariencia';
import { useApariencia } from '../hooks/useApariencia';

const ICONOS: Record<Apariencia, LucideIcon> = {
  sistema: Monitor,
  claro: Sun,
  oscuro: Moon,
  'alto-contraste': Contrast,
};

/**
 * US-23 · Apariencia: Sistema, Claro, Oscuro o Alto contraste. Está en el
 * perfil (con la descripción de cada opción) y en el menú de cuenta
 * (compacto). Es un grupo de radios nativos con su `<legend>`: se recorre con
 * las flechas y el lector anuncia «Apariencia, Oscuro, 3 de 4». Aplica en el
 * acto y queda guardada en este dispositivo.
 *
 * Cada instancia lleva su propio `name` (`useId`): el menú está dos veces en
 * la página (cabecera y barra inferior) y radios con el mismo nombre en
 * grupos distintos se desmarcarían entre sí.
 */
export function SelectorDeApariencia({ variante = 'perfil' }: { variante?: 'perfil' | 'menu' }) {
  const { apariencia, elegir } = useApariencia();
  const nombre = useId();
  const enMenu = variante === 'menu';

  return (
    <fieldset className={enMenu ? 'border-t border-linea px-1 pt-2 pb-1' : 'flex flex-col gap-2'}>
      <legend className={enMenu ? 'px-2 text-sm font-semibold text-texto-2' : 'text-base font-semibold text-texto'}>
        Apariencia
      </legend>
      {!enMenu && (
        <p className="text-sm text-texto-2">Se guarda en este dispositivo y se aplica en el acto.</p>
      )}
      <div className={enMenu ? 'mt-1 grid grid-cols-2 gap-1' : 'grid gap-2 sm:grid-cols-2'}>
        {OPCIONES_DE_APARIENCIA.map((opcion) => {
          const elegida = apariencia === opcion.valor;
          return (
            <label
              key={opcion.valor}
              className={[
                'flex min-h-objetivo cursor-pointer items-center gap-2 rounded-control border px-3',
                enMenu ? 'py-1.5 text-sm' : 'py-2',
                elegida ? 'border-primario bg-superficie-2 font-semibold text-texto' : 'border-linea text-texto',
              ].join(' ')}
            >
              <input
                type="radio"
                name={nombre}
                value={opcion.valor}
                checked={elegida}
                onChange={() => elegir(opcion.valor)}
                className="size-4 shrink-0 accent-[var(--cv-primario)]"
              />
              <Icono icono={ICONOS[opcion.valor]} tamano={enMenu ? 16 : 18} />
              <span className="flex flex-col">
                {opcion.etiqueta}
                {!enMenu && <span className="text-sm font-normal text-texto-2">{opcion.descripcion}</span>}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

'use client';

import Link from 'next/link';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { ChevronDown, CircleUser } from 'lucide-react';
import { Icono } from '@/components/ui/Icono';
import type { Usuario } from '@/lib/types/domain';
import { descripcionDeCuenta, iniciales, type ItemNavegacion } from '../model/navegacion';
import { BotonCerrarSesion } from './BotonCerrarSesion';
import { ICONOS_DE_NAVEGACION } from './iconosDeNavegacion';

interface MenuCuentaProps {
  /** `null`: hay sesión pero no se pudo saber de quién (sin red). */
  usuario: Usuario | null;
  /** Enlaces de la cuenta según el rol (`navegacionDe(rol).cuenta`). */
  items: readonly ItemNavegacion[];
  /** En la cabecera (escritorio) o como último ítem de la barra inferior (móvil). */
  variante: 'cabecera' | 'inferior';
  /** Ruta actual: el menú se cierra al navegar. */
  ruta: string;
  /** Contenido adicional antes de «Cerrar sesión» (el selector de apariencia). */
  children?: ReactNode;
}

/**
 * Menú de cuenta (DIS-1): quién es, sus enlaces (perfil, soporte…), la
 * apariencia y «Cerrar sesión», que ya no compite con las acciones de cada
 * pantalla.
 *
 * Es un **desplegable** (botón con `aria-expanded` que muestra un panel), no
 * un `role="menu"`: adentro hay enlaces y un grupo de opciones de radio, que
 * se recorren con Tab como en cualquier página. Se cierra con Escape (y el
 * foco vuelve al botón), al tocar fuera y al navegar.
 */
export function MenuCuenta({ usuario, items, variante, ruta, children }: MenuCuentaProps) {
  const [abierto, setAbierto] = useState(false);
  // Al navegar se cierra. Se ajusta durante el render (el patrón de React
  // para estado que depende de una prop), no con un efecto que pintaría un
  // cuadro con el menú todavía abierto en la pantalla nueva.
  const [rutaDelMenu, setRutaDelMenu] = useState(ruta);
  if (rutaDelMenu !== ruta) {
    setRutaDelMenu(ruta);
    setAbierto(false);
  }
  const idPanel = useId();
  const contenedor = useRef<HTMLDivElement>(null);
  const boton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!abierto) return;
    const alPulsar = (evento: KeyboardEvent) => {
      if (evento.key !== 'Escape') return;
      setAbierto(false);
      boton.current?.focus();
    };
    const alTocar = (evento: PointerEvent) => {
      if (!contenedor.current?.contains(evento.target as Node)) setAbierto(false);
    };
    document.addEventListener('keydown', alPulsar);
    document.addEventListener('pointerdown', alTocar);
    return () => {
      document.removeEventListener('keydown', alPulsar);
      document.removeEventListener('pointerdown', alTocar);
    };
  }, [abierto]);

  const nombre = usuario ? `${usuario.nombre} ${usuario.apellido}`.trim() : 'Tu cuenta';
  const enCabecera = variante === 'cabecera';

  return (
    <div ref={contenedor} className={enCabecera ? 'relative' : 'h-full'}>
      <button
        ref={boton}
        type="button"
        aria-expanded={abierto}
        aria-controls={idPanel}
        onClick={() => setAbierto(!abierto)}
        className={
          enCabecera
            ? 'inline-flex min-h-objetivo items-center gap-2 rounded-full border border-linea bg-superficie py-1 pr-3 pl-1 font-semibold text-texto hover:bg-superficie-2'
            : `flex h-full w-full flex-col items-center justify-center gap-0.5 border-t-[3px] text-xs leading-tight ${
                abierto ? 'border-t-primario font-bold text-texto' : 'border-t-transparent font-semibold text-texto-2'
              }`
        }
      >
        {enCabecera ? (
          <>
            <span
              aria-hidden="true"
              className="flex size-8 items-center justify-center rounded-full bg-primario text-sm font-bold text-sobre-primario"
            >
              {usuario ? iniciales(usuario.nombre, usuario.apellido) : <Icono icono={CircleUser} tamano={18} />}
            </span>
            {/* El nombre accesible contiene el visible (WCAG 2.5.3). */}
            <span className="sr-only">Menú de cuenta de {nombre}</span>
            <span aria-hidden="true" className="max-w-48 truncate">
              {nombre}
            </span>
            <Icono icono={ChevronDown} tamano={16} className={abierto ? 'rotate-180' : ''} />
          </>
        ) : (
          <>
            <Icono icono={CircleUser} tamano={22} trazo={abierto ? 2.4 : 2} />
            Cuenta
          </>
        )}
      </button>

      {abierto && (
        <div
          id={idPanel}
          className={[
            'z-[1060] flex flex-col gap-1 overflow-y-auto border border-linea bg-superficie p-2 text-texto shadow-elevada',
            enCabecera
              ? 'absolute top-full right-0 mt-2 max-h-[calc(100dvh-5rem)] w-80 rounded-hoja'
              : 'fixed inset-x-0 bottom-[var(--cv-alto-nav,4rem)] max-h-[70dvh] rounded-t-hoja border-b-0',
          ].join(' ')}
        >
          <div className="border-b border-linea px-3 pt-2 pb-3">
            <p className="font-semibold">{nombre}</p>
            <p className="text-sm text-texto-2">
              {usuario ? descripcionDeCuenta(usuario) : 'No se pudo cargar tu cuenta: revisa tu conexión.'}
            </p>
            {usuario && <p className="truncate text-sm text-texto-2">{usuario.email}</p>}
          </div>

          {items.length > 0 && (
            <ul className="flex flex-col py-1">
              {items.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={() => setAbierto(false)}
                    className="flex min-h-objetivo items-center gap-3 rounded-control px-3 font-semibold text-texto hover:bg-superficie-2"
                  >
                    <Icono icono={ICONOS_DE_NAVEGACION[item.icono]} tamano={18} />
                    {item.etiqueta}
                  </Link>
                </li>
              ))}
            </ul>
          )}

          {children}

          <div className="border-t border-linea pt-1">
            <BotonCerrarSesion variante="menu" />
          </div>
        </div>
      )}
    </div>
  );
}

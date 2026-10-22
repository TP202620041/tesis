'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { clasesDeBoton } from '@/components/ui/Boton';
import { Icono } from '@/components/ui/Icono';
import { Logo } from '@/components/ui/Logo';
import type { Usuario } from '@/lib/types/domain';
import { esRutaActual, navegacionDe, type ItemNavegacion } from '../model/navegacion';
import type { UsuarioDelMarco } from '../hooks/useUsuarioDelMarco';
import { ICONOS_DE_NAVEGACION } from './iconosDeNavegacion';
import { MenuCuenta } from './MenuCuenta';

/** Rol para la navegación; `undefined` mientras se averigua quién mira. */
function rolDelMarco(usuario: UsuarioDelMarco) {
  switch (usuario.estado) {
    case 'cargando':
      return undefined;
    case 'visitante':
      return null;
    case 'sin-identificar':
      return 'desconocido' as const;
    case 'identificado':
      return usuario.usuario.rol;
  }
}

function usuarioDe(usuario: UsuarioDelMarco): Usuario | null {
  return usuario.estado === 'identificado' ? usuario.usuario : null;
}

const conSesion = (usuario: UsuarioDelMarco) =>
  usuario.estado === 'identificado' || usuario.estado === 'sin-identificar';

interface CabeceraProps {
  usuario: UsuarioDelMarco;
  ruta: string;
  /** `false` en la aceptación de términos: solo el logo. */
  conNavegacion: boolean;
  /** Lo que va dentro del menú de cuenta antes de «Cerrar sesión» (apariencia). */
  extrasDeCuenta?: ReactNode;
}

/**
 * Cabecera común (DIS-1). En el móvil, el logo; en escritorio, además, la
 * navegación del rol, la insignia «Municipalidad de X» del funcionario y el
 * menú de cuenta (o «Iniciar sesión» y «Crear cuenta» para el visitante).
 * Mide `--cv-alto-encabezado`, que `/mapa` descuenta para ocupar el resto.
 */
export function CabeceraDeLaApp({ usuario, ruta, conNavegacion, extrasDeCuenta }: CabeceraProps) {
  const rol = rolDelMarco(usuario);
  const nav = conNavegacion && rol !== undefined ? navegacionDe(rol) : null;
  const persona = usuarioDe(usuario);
  const municipalidad =
    persona?.rol === 'FUNCIONARIO_MUNICIPAL' && persona.distritoNombre
      ? `Municipalidad de ${persona.distritoNombre}`
      : null;

  return (
    <header className="h-[var(--cv-alto-encabezado)] shrink-0 border-b border-linea bg-superficie">
      <div className="mx-auto flex h-full max-w-7xl items-center gap-3 px-4 lg:gap-5 lg:px-6">
        <Link href="/" className="inline-flex min-h-objetivo shrink-0 items-center rounded-control">
          <Logo conNombre />
        </Link>
        {municipalidad && (
          <span className="hidden shrink-0 rounded-control bg-superficie-2 px-2.5 py-1 text-sm font-semibold text-texto-2 xl:inline">
            {municipalidad}
          </span>
        )}

        {nav && nav.principal.length > 0 && (
          <nav aria-label="Principal" className="hidden min-w-0 md:block">
            <ul className="flex items-center gap-1">
              {nav.principal.map((item) => (
                <li key={item.href}>
                  <EnlaceDeCabecera item={item} actual={esRutaActual(ruta, item)} />
                </li>
              ))}
            </ul>
          </nav>
        )}

        <div className="ml-auto flex shrink-0 items-center gap-2">
          {nav && nav.acceso.length > 0 && (
            <div className="hidden items-center gap-2 md:flex">
              {nav.acceso.map((item, i) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={clasesDeBoton(i === 0 ? 'texto' : 'secundario', 'compacto')}
                >
                  {item.etiqueta}
                </Link>
              ))}
            </div>
          )}
          {nav && conSesion(usuario) && (
            <div className="hidden md:block">
              <MenuCuenta usuario={persona} items={nav.cuenta} variante="cabecera" ruta={ruta}>
                {extrasDeCuenta}
              </MenuCuenta>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

function EnlaceDeCabecera({ item, actual }: { item: ItemNavegacion; actual: boolean }) {
  if (item.destacado) {
    return (
      <Link href={item.href} aria-current={actual ? 'page' : undefined} className={`${clasesDeBoton('primario', 'compacto')} ml-2`}>
        <Icono icono={ICONOS_DE_NAVEGACION[item.icono]} tamano={18} trazo={2.4} />
        {item.etiqueta}
      </Link>
    );
  }
  return (
    <Link
      href={item.href}
      aria-current={actual ? 'page' : undefined}
      className={[
        'inline-flex min-h-objetivo items-center border-y-[3px] border-t-transparent px-3 whitespace-nowrap',
        actual
          ? 'border-b-primario font-bold text-texto'
          : 'border-b-transparent font-semibold text-texto-2 hover:text-texto',
      ].join(' ')}
    >
      {item.etiqueta}
    </Link>
  );
}

interface BarraInferiorProps {
  usuario: UsuarioDelMarco;
  ruta: string;
  extrasDeCuenta?: ReactNode;
}

/**
 * Barra de navegación inferior del móvil (DIS-1): hasta cinco destinos con
 * icono y nombre, «Reportar» destacado al centro para el ciudadano y «Cuenta»
 * al final con el menú. Fija abajo, respeta `env(safe-area-inset-bottom)` y
 * mide `--cv-alto-nav`, que el contenido reserva para no quedar tapado. Desde
 * `md` la reemplaza la cabecera.
 */
export function BarraInferiorDeLaApp({ usuario, ruta, extrasDeCuenta }: BarraInferiorProps) {
  const rol = rolDelMarco(usuario);
  const clases =
    'fixed inset-x-0 bottom-0 z-[1050] border-t border-linea bg-superficie pb-[env(safe-area-inset-bottom)] md:hidden';
  // Mientras se averigua quién mira, la barra ocupa su lugar vacía: así el
  // contenido no salta cuando llegan los ítems.
  if (rol === undefined) return <div aria-hidden="true" className={`${clases} h-[var(--cv-alto-nav)]`} />;

  const nav = navegacionDe(rol);
  const columnas = nav.inferior.length + (conSesion(usuario) ? 1 : 0);
  return (
    <nav aria-label="Principal" className={clases}>
      <ul className="grid h-16" style={{ gridTemplateColumns: `repeat(${columnas}, minmax(0, 1fr))` }}>
        {nav.inferior.map((item) => {
          const actual = esRutaActual(ruta, item);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={actual ? 'page' : undefined}
                className={[
                  'flex h-full flex-col items-center justify-center gap-0.5 border-t-[3px] text-center text-xs leading-tight whitespace-nowrap',
                  actual
                    ? 'border-t-primario font-bold text-texto'
                    : 'border-t-transparent font-semibold text-texto-2',
                ].join(' ')}
              >
                {item.destacado ? (
                  <span className="flex h-8 w-10 items-center justify-center rounded-[10px] bg-primario text-sobre-primario">
                    <Icono icono={ICONOS_DE_NAVEGACION[item.icono]} tamano={22} trazo={2.4} />
                  </span>
                ) : (
                  <Icono icono={ICONOS_DE_NAVEGACION[item.icono]} tamano={22} trazo={actual ? 2.4 : 2} />
                )}
                {item.etiquetaCorta ?? item.etiqueta}
              </Link>
            </li>
          );
        })}
        {conSesion(usuario) && (
          <li>
            <MenuCuenta usuario={usuarioDe(usuario)} items={nav.cuenta} variante="inferior" ruta={ruta}>
              {extrasDeCuenta}
            </MenuCuenta>
          </li>
        )}
      </ul>
    </nav>
  );
}

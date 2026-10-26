'use client';

import { usePathname } from 'next/navigation';
import { useRef, type ReactNode } from 'react';
import { useTemaDeLaApp } from '../hooks/useApariencia';
import { useMemoriaDeDesplazamiento } from '../hooks/useMemoriaDeDesplazamiento';
import { useUsuarioDelMarco } from '../hooks/useUsuarioDelMarco';
import { modoDelMarco } from '../model/navegacion';
import { BarraInferiorDeLaApp, CabeceraDeLaApp } from './NavegacionDelMarco';
import { SelectorDeApariencia } from './SelectorDeApariencia';

/**
 * Marco común de la app (DIS-1): cabecera con el logo y, según el rol, la
 * navegación y el menú de cuenta; en el móvil, la barra inferior. Reemplaza
 * las cabeceras que cada pantalla armaba por su cuenta (con su propio
 * «Cerrar sesión»).
 *
 * Vive en el layout raíz para no desmontarse al navegar: pregunta quién mira
 * una vez por sesión (`useUsuarioDelMarco`) y se lo pasa a la cabecera y a la
 * barra por props. Las pantallas de acceso no lo llevan (`modoDelMarco`).
 * También mantiene el tema (US-23) en todas las pantallas, incluidas esas.
 *
 * Fija dos medidas como variables CSS para quien las necesite (el mapa ocupa
 * el alto que queda; los avisos flotantes van por encima de la barra):
 * `--cv-alto-encabezado` y `--cv-alto-nav`.
 */
export function MarcoDeLaApp({ children }: { children: ReactNode }) {
  const ruta = usePathname();
  const usuario = useUsuarioDelMarco();
  useTemaDeLaApp();
  // Al volver a una pantalla, a donde se estaba (no en blanco mientras carga).
  useMemoriaDeDesplazamiento(ruta);
  const modo = modoDelMarco(ruta);
  const contenido = useRef<HTMLDivElement>(null);

  if (modo === 'ninguno') {
    // Sin cabecera, la hora y la batería (en blanco en la PWA instalada en
    // iPhone) necesitan igual su franja tinta debajo.
    return (
      <>
        <div aria-hidden="true" className="cv-translucida fixed inset-x-0 top-0 z-[1070] h-[env(safe-area-inset-top)]" />
        {children}
      </>
    );
  }
  const completo = modo === 'completo';

  return (
    <div
      className={[
        // Las medidas incluyen las zonas seguras (la isla arriba, la barra de
        // inicio abajo): con `viewport-fit=cover` la página llega a los bordes.
        'flex min-h-dvh flex-col',
        '[--cv-alto-encabezado:calc(3.5rem+env(safe-area-inset-top))] md:[--cv-alto-encabezado:calc(4rem+env(safe-area-inset-top))]',
        completo
          ? '[--cv-alto-nav:calc(4rem+env(safe-area-inset-bottom))] md:[--cv-alto-nav:env(safe-area-inset-bottom)]'
          : '[--cv-alto-nav:env(safe-area-inset-bottom)]',
      ].join(' ')}
    >
      <a
        href="#contenido"
        className="sr-only z-[1100] rounded-control bg-primario px-4 py-3 font-semibold text-sobre-primario focus:not-sr-only focus:fixed focus:top-[calc(0.5rem+env(safe-area-inset-top))] focus:left-[calc(0.5rem+env(safe-area-inset-left))]"
      >
        Saltar al contenido
      </a>
      <CabeceraDeLaApp
        usuario={usuario}
        ruta={ruta}
        conNavegacion={completo}
        extrasDeCuenta={<SelectorDeApariencia variante="menu" />}
        contenido={contenido}
      />
      {/* Los laterales reservan las zonas seguras (el teléfono girado); la
          cabecera las suma a su margen interno para que su fondo llegue al borde. */}
      <div
        id="contenido"
        ref={contenido}
        tabIndex={-1}
        className="flex flex-1 flex-col pr-[env(safe-area-inset-right)] pb-[var(--cv-alto-nav)] pl-[env(safe-area-inset-left)]"
      >
        {children}
      </div>
      {completo && <BarraInferiorDeLaApp usuario={usuario} ruta={ruta} />}
    </div>
  );
}

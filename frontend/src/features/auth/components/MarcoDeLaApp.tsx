'use client';

import { usePathname } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { useTemaDeLaApp } from '../hooks/useApariencia';
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
 *
 * Mientras el menú de cuenta del móvil cubre la pantalla, la cabecera y el
 * contenido quedan inertes; la barra inferior no.
 */
export function MarcoDeLaApp({ children }: { children: ReactNode }) {
  const ruta = usePathname();
  const usuario = useUsuarioDelMarco();
  useTemaDeLaApp();
  const modo = modoDelMarco(ruta);
  const [cuentaCubre, setCuentaCubre] = useState(false);

  if (modo === 'ninguno') return <>{children}</>;
  const completo = modo === 'completo';
  const apariencia = <SelectorDeApariencia variante="menu" />;

  return (
    <div
      className={[
        'flex min-h-dvh flex-col [--cv-alto-encabezado:3.5rem] md:[--cv-alto-encabezado:4rem]',
        completo
          ? '[--cv-alto-nav:calc(4rem+env(safe-area-inset-bottom))] md:[--cv-alto-nav:0px]'
          : '[--cv-alto-nav:0px]',
      ].join(' ')}
    >
      {/* `contents`: el envoltorio no cuenta para el layout en columna. */}
      <div inert={cuentaCubre} className="contents">
        <a
          href="#contenido"
          className="sr-only z-[1100] rounded-control bg-primario px-4 py-3 font-semibold text-sobre-primario focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
        >
          Saltar al contenido
        </a>
        <CabeceraDeLaApp usuario={usuario} ruta={ruta} conNavegacion={completo} extrasDeCuenta={apariencia} />
        <div id="contenido" tabIndex={-1} className="flex flex-1 flex-col pb-[var(--cv-alto-nav)]">
          {children}
        </div>
      </div>
      {completo && (
        <BarraInferiorDeLaApp
          usuario={usuario}
          ruta={ruta}
          extrasDeCuenta={apariencia}
          alCubrirLaPantalla={setCuentaCubre}
        />
      )}
    </div>
  );
}

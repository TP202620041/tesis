'use client';

import {
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type MouseEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';

const sinSuscripcion = () => () => {};
const enCliente = () => true;
const enServidor = () => false;

interface DialogoProps {
  abierto: boolean;
  alCerrar: () => void;
  titulo: string;
  children: ReactNode;
}

/**
 * Dialogo modal sobre `<dialog>` nativo con `showModal()`: el navegador deja
 * inerte el resto de la pagina (el foco no sale del dialogo), cierra con Esc
 * y devuelve el foco a quien lo abrio. El titulo lo nombra por
 * `aria-labelledby`.
 *
 * Se monta en un portal sobre `document.body` para que no quede dentro de un
 * `<label>` o un `<form>` de quien lo usa: un clic en el texto marcaria la
 * casilla del label, y el boton Cerrar enviaria el formulario.
 */
export function Dialogo({ abierto, alCerrar, titulo, children }: DialogoProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const idTitulo = useId();
  const clicEnFondo = useRef(false);
  // El portal necesita `document`: no se renderiza en el servidor ni en la
  // hidratacion (que debe coincidir con el HTML del servidor).
  const montado = useSyncExternalStore(sinSuscripcion, enCliente, enServidor);

  useEffect(() => {
    const dialogo = ref.current;
    if (!dialogo) return;
    if (abierto && !dialogo.open) dialogo.showModal();
    if (!abierto && dialogo.open) dialogo.close();
  }, [abierto, montado]);

  if (!montado) return null;

  return createPortal(
    <dialog
      ref={ref}
      aria-labelledby={idTitulo}
      // Esc y `close()` terminan aqui: el estado de quien lo abrio se entera.
      onClose={alCerrar}
      // Un clic en el fondo (fuera de la caja) cae en el propio <dialog>. Solo
      // cierra si tambien empezo ahi: seleccionar texto y soltar fuera no.
      onMouseDown={(e) => {
        clicEnFondo.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        if (clicEnFondo.current && e.target === e.currentTarget) alCerrar();
        clicEnFondo.current = false;
      }}
      className="m-auto w-[calc(100%-2rem)] max-w-3xl rounded-lg bg-white p-0 shadow-xl
                 backdrop:bg-slate-900/60 dark:bg-slate-900"
    >
      <div className="flex max-h-[85vh] flex-col">
        <header className="flex items-center justify-between gap-4 border-b border-slate-200 px-4 py-3 dark:border-slate-700">
          <h2 id={idTitulo} className="text-base font-semibold text-slate-900 dark:text-slate-100">
            {titulo}
          </h2>
          <button
            type="button"
            onClick={alCerrar}
            className="rounded-md border border-slate-300 px-3 py-1 text-sm text-slate-700 hover:bg-slate-100
                       dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            Cerrar
          </button>
        </header>
        {/* `overscroll-contain`: llegar al final del texto no desplaza la pagina de fondo. */}
        <div className="overflow-y-auto overscroll-contain px-4 py-4">{children}</div>
      </div>
    </dialog>,
    document.body,
  );
}

interface EnlaceConDialogoProps {
  /** Pagina con el mismo contenido, para abrir aparte o sin JavaScript. */
  href: string;
  titulo: string;
  contenido: ReactNode;
  className?: string;
  children: ReactNode;
}

/**
 * Enlace que muestra `contenido` en un {@link Dialogo} sin salir de la pagina
 * (y sin perder lo que el usuario ya escribio en ella). Sigue siendo un
 * enlace real a `href`: con Ctrl/Cmd o la rueda el navegador lo abre aparte,
 * como cualquier enlace, si el usuario lo pide.
 */
export function EnlaceConDialogo({ href, titulo, contenido, className, children }: EnlaceConDialogoProps) {
  const [abierto, setAbierto] = useState(false);

  function alHacerClic(e: MouseEvent<HTMLAnchorElement>) {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    setAbierto(true);
  }

  return (
    <>
      <a href={href} onClick={alHacerClic} aria-haspopup="dialog" className={className}>
        {children}
      </a>
      <Dialogo abierto={abierto} alCerrar={() => setAbierto(false)} titulo={titulo}>
        {contenido}
      </Dialogo>
    </>
  );
}

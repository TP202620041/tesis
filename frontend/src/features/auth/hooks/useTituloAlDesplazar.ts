'use client';

import { useEffect, useState, type RefObject } from 'react';

/** Variable CSS de la barra: 0 con el título en la página, 1 cuando ya pasó a la barra. */
export const AVANCE_DEL_TITULO = '--cv-avance-titulo';

/** Cuánto se mete el `<h1>` bajo la barra antes de que empiece el cambio (px). */
const MARGEN = 10;
/** Recorrido extra, además del alto del `<h1>`, para completar el cambio (px). */
const RECORRIDO = 22;

const limitar = (valor: number) => Math.min(1, Math.max(0, valor));

/**
 * Título de la barra superior del móvil (DIS-1, «el scroll de WhatsApp»,
 * efecto A elegido por el usuario el 23/10): a medida que el `<h1>` de la
 * pantalla pasa por debajo de la barra, su texto entra centrado en ella y el
 * logo se va. El cambio va **ligado al dedo**, no a un fundido con tiempo:
 * si se baja despacio, el título entra despacio, y se puede quedar a medias.
 * Las pantallas no cambian: el título grande sigue siendo su `<h1>`.
 *
 * El avance (0 a 1) se escribe como variable CSS en la barra
 * ({@link AVANCE_DEL_TITULO}) y como `data-compacto` (avance casi completo,
 * para sacar del foco el logo invisible), una vez por cuadro y sin pasar por
 * React: un render por cuadro de desplazamiento sería trabajo de más. React
 * solo se entera cuando cambia el texto (el detalle que terminó de cargar).
 * Un MutationObserver vuelve a buscar el `<h1>` en `contenido` cuando la
 * pantalla lo cambia.
 */
export function useTituloAlDesplazar(
  ruta: string,
  barra: RefObject<HTMLElement | null>,
  contenido: RefObject<HTMLElement | null>,
): string | null {
  const [texto, setTexto] = useState<string | null>(null);
  // Al navegar vuelve a empezar. Se ajusta durante el render (como el menú de
  // cuenta), no con un efecto: la pantalla nueva no pinta el título anterior.
  const [rutaDelTitulo, setRutaDelTitulo] = useState(ruta);
  if (rutaDelTitulo !== ruta) {
    setRutaDelTitulo(ruta);
    setTexto(null);
  }

  useEffect(() => {
    const pantalla = contenido.current;
    const elemento = barra.current;
    if (!pantalla || !elemento) return;

    const enCuadro =
      typeof requestAnimationFrame === 'function'
        ? requestAnimationFrame
        : (medir: FrameRequestCallback) => {
            medir(0);
            return 0;
          };
    let h1: HTMLElement | null = pantalla.querySelector('h1');
    let ultimoTexto: string | null = null;
    // Bandera aparte del id: si el cuadro corre en el acto (sin
    // requestAnimationFrame), `medir` la baja antes de que vuelva el id.
    let pendiente = false;
    let cuadro = 0;

    const medir = () => {
      pendiente = false;
      let avance = 0;
      if (h1) {
        const caja = h1.getBoundingClientRect();
        const borde = elemento.getBoundingClientRect().bottom;
        avance = limitar((borde - caja.top - MARGEN) / (caja.height + RECORRIDO));
      }
      elemento.style.setProperty(AVANCE_DEL_TITULO, avance.toFixed(3));
      elemento.dataset.compacto = String(avance > 0.95);
      const actual = h1?.textContent?.trim() || null;
      if (actual !== ultimoTexto) {
        ultimoTexto = actual;
        setTexto(actual);
      }
    };
    const pedir = () => {
      if (pendiente) return;
      pendiente = true;
      cuadro = enCuadro(medir);
    };
    const mutaciones = new MutationObserver(() => {
      h1 = pantalla.querySelector('h1');
      pedir();
    });

    mutaciones.observe(pantalla, { childList: true, subtree: true, characterData: true });
    window.addEventListener('scroll', pedir, { passive: true });
    window.addEventListener('resize', pedir);
    pedir();

    return () => {
      mutaciones.disconnect();
      window.removeEventListener('scroll', pedir);
      window.removeEventListener('resize', pedir);
      if (pendiente && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(cuadro);
      elemento.style.removeProperty(AVANCE_DEL_TITULO);
      delete elemento.dataset.compacto;
    };
  }, [ruta, barra, contenido]);

  return texto;
}

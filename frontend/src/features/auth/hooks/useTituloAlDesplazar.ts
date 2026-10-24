'use client';

import { useEffect, useState, type RefObject } from 'react';

export interface TituloAlDesplazar {
  /** Texto del `<h1>` de la pantalla; `null` si no tiene. */
  texto: string | null;
  /** El `<h1>` ya pasó por debajo de la barra: su texto va en ella. */
  compacto: boolean;
}

const SIN_TITULO: TituloAlDesplazar = { texto: null, compacto: false };

/**
 * Título compacto de la barra superior del móvil (DIS-1, «el scroll de
 * WhatsApp», prueba en iPhone del 23/10): cuando el `<h1>` de la pantalla
 * pasa por debajo de la barra, su texto aparece centrado en ella; al volver
 * arriba, se va. Las pantallas no cambian: el título grande sigue siendo su
 * `<h1>`.
 *
 * Observa el primer `<h1>` de `#contenido` con un IntersectionObserver
 * recortado por el alto de la barra (sin escuchar el scroll), y un
 * MutationObserver lo vuelve a buscar cuando la pantalla lo cambia: las que
 * cargan datos lo pintan después, y el de un detalle es el título del
 * reporte. Sin IntersectionObserver (navegadores viejos, jsdom) no hace nada.
 */
export function useTituloAlDesplazar(ruta: string, barra: RefObject<HTMLElement | null>): TituloAlDesplazar {
  const [titulo, setTitulo] = useState(SIN_TITULO);
  // Al navegar vuelve a empezar. Se ajusta durante el render (como el menú de
  // cuenta), no con un efecto: la pantalla nueva no pinta el título anterior.
  const [rutaDelTitulo, setRutaDelTitulo] = useState(ruta);
  if (rutaDelTitulo !== ruta) {
    setRutaDelTitulo(ruta);
    setTitulo(SIN_TITULO);
  }

  useEffect(() => {
    const contenido = document.getElementById('contenido');
    if (!contenido || typeof IntersectionObserver !== 'function') return;

    const textoDe = (h1: Element) => h1.textContent?.trim() || null;
    const alto = barra.current?.offsetHeight ?? 0;
    const observador = new IntersectionObserver(
      (entradas) => {
        const entrada = entradas.at(-1);
        if (!entrada) return;
        // Compacto solo si salió por ARRIBA (no si todavía no llega desde abajo).
        const arriba = entrada.rootBounds !== null && entrada.boundingClientRect.bottom <= entrada.rootBounds.top;
        setTitulo({ texto: textoDe(entrada.target), compacto: !entrada.isIntersecting && arriba });
      },
      { rootMargin: `-${alto}px 0px 0px 0px` },
    );

    let observado: Element | null = null;
    const buscar = () => {
      const h1 = contenido.querySelector('h1');
      if (h1 === observado) {
        // El mismo `<h1>` con otro texto (el detalle que terminó de cargar).
        if (h1) setTitulo((t) => (t.texto === textoDe(h1) ? t : { ...t, texto: textoDe(h1) }));
        return;
      }
      if (observado) observador.unobserve(observado);
      observado = h1;
      // Observarlo dispara la primera lectura, que fija el texto.
      if (h1) observador.observe(h1);
      else setTitulo(SIN_TITULO);
    };
    const mutaciones = new MutationObserver(buscar);
    mutaciones.observe(contenido, { childList: true, subtree: true, characterData: true });
    const h1 = contenido.querySelector('h1');
    if (h1) {
      observado = h1;
      observador.observe(h1);
    }

    return () => {
      mutaciones.disconnect();
      observador.disconnect();
    };
  }, [ruta, barra]);

  return titulo;
}

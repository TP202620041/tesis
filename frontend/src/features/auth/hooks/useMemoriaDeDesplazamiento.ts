'use client';

import { useEffect, useRef } from 'react';
import { esRegresoDentroDeSuDestino } from '../model/navegacion';

/** Cuánto se espera a que la pantalla crezca lo suficiente para volver (ms). */
const ESPERA_MAXIMA = 5000;

/**
 * Posición de cada pantalla (ruta con su búsqueda) al dejarla. Vive mientras
 * viva la app: no hace falta guardarla entre recargas.
 */
const posiciones = new Map<string, number>();

const claveActual = () => window.location.pathname + window.location.search;

/** Un clic de los que navegan: botón principal, sin teclas que abran aparte, del mismo origen. */
function esClicQueNavega(evento: MouseEvent): boolean {
  if (evento.button !== 0 || evento.metaKey || evento.ctrlKey || evento.shiftKey || evento.altKey) return false;
  const enlace = (evento.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
  if (!enlace || (enlace.target && enlace.target !== '_self')) return false;
  return new URL(enlace.href, window.location.href).origin === window.location.origin;
}

/**
 * Al volver a una pantalla, se vuelve a donde se estaba (DIS-1, prueba en
 * iPhone del 23/10): de «Soporte» a «Cuenta», del detalle a «Mis reportes».
 *
 * Las pantallas cargan sus datos al montarse: por un momento miden poco más
 * que «Cargando…». El navegador intentaba devolver la posición en ese
 * momento, cuando la página todavía no llegaba tan abajo: Chrome la dejaba
 * arriba, y Safari en iOS la dejaba **más allá del contenido**, en blanco
 * hasta mover el dedo. Por eso el marco se queda con la restauración
 * (`history.scrollRestoration = 'manual'`):
 *
 * - Anota la posición al irse (un clic en un enlace o atrás/adelante), no
 *   durante el desplazamiento: así no la pisa el salto a arriba de la
 *   pantalla nueva.
 * - Al volver (atrás/adelante, o tocar el destino del que colgaba la
 *   pantalla anterior: {@link esRegresoDentroDeSuDestino}) empieza arriba,
 *   nunca más allá del contenido, y baja a la posición anotada en cuanto la
 *   página mide lo suficiente (ResizeObserver, hasta {@link ESPERA_MAXIMA}).
 * - Si la persona se mueve antes, no se le quita el control.
 * - Cualquier otra navegación queda como siempre: arriba (lo hace Next).
 */
export function useMemoriaDeDesplazamiento(ruta: string): void {
  const estado = useRef({ clave: '', rutaAnterior: null as string | null, desdeElHistorial: false });

  useEffect(() => {
    const previa = window.history.scrollRestoration;
    window.history.scrollRestoration = 'manual';
    const anotar = () => {
      if (estado.current.clave) posiciones.set(estado.current.clave, window.scrollY);
    };
    const alHacerClic = (evento: MouseEvent) => {
      if (esClicQueNavega(evento)) anotar();
    };
    // Atrás/adelante: el desplazamiento todavía es el de la pantalla que se deja.
    const alMoverseEnElHistorial = () => {
      anotar();
      estado.current.desdeElHistorial = true;
    };
    document.addEventListener('click', alHacerClic, true);
    window.addEventListener('popstate', alMoverseEnElHistorial);
    return () => {
      document.removeEventListener('click', alHacerClic, true);
      window.removeEventListener('popstate', alMoverseEnElHistorial);
      window.history.scrollRestoration = previa;
    };
  }, []);

  useEffect(() => {
    const { rutaAnterior, desdeElHistorial } = estado.current;
    const clave = claveActual();
    estado.current = { clave, rutaAnterior: ruta, desdeElHistorial: false };

    // Atrás/adelante no mueve la página por sí solo (restauración manual):
    // arriba, para no quedar más allá de lo que todavía no cargó.
    if (desdeElHistorial) window.scrollTo(0, 0);
    const esRegreso = desdeElHistorial || (rutaAnterior !== null && esRegresoDentroDeSuDestino(rutaAnterior, ruta));
    const objetivo = posiciones.get(clave) ?? 0;
    if (!esRegreso || objetivo <= 0) return;

    let terminado = false;
    const observador = typeof ResizeObserver === 'function' ? new ResizeObserver(() => intentar()) : null;
    const soltar = () => terminar();
    const tope = window.setTimeout(soltar, ESPERA_MAXIMA);
    function terminar() {
      if (terminado) return;
      terminado = true;
      observador?.disconnect();
      window.clearTimeout(tope);
      for (const tipo of ['touchstart', 'wheel', 'keydown', 'pointerdown'] as const) {
        window.removeEventListener(tipo, soltar);
      }
    }
    function intentar() {
      if (terminado) return;
      if (document.documentElement.scrollHeight - window.innerHeight < objetivo) return;
      window.scrollTo(0, objetivo);
      terminar();
    }
    for (const tipo of ['touchstart', 'wheel', 'keydown', 'pointerdown'] as const) {
      window.addEventListener(tipo, soltar, { passive: true });
    }
    observador?.observe(document.body);
    intentar();
    return terminar;
  }, [ruta]);
}

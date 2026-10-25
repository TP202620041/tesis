import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useMemoriaDeDesplazamiento } from './useMemoriaDeDesplazamiento';

/*
 * jsdom no desplaza ni mide: el test dicta cuánto mide la página y dónde está,
 * y dispara a mano el ResizeObserver cuando «llega el contenido».
 */
const PANTALLA = 659;
let y = 0;
let alto = PANTALLA;
let alCrecer: Array<() => void> = [];
const desplazarA = vi.fn((_x: number, nuevo: number) => {
  y = nuevo;
});

beforeEach(() => {
  y = 0;
  alto = PANTALLA;
  alCrecer = [];
  desplazarA.mockClear();
  vi.stubGlobal('scrollTo', desplazarA);
  Object.defineProperty(window, 'scrollY', { configurable: true, get: () => y });
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: PANTALLA });
  Object.defineProperty(document.documentElement, 'scrollHeight', { configurable: true, get: () => alto });
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(avisar: () => void) {
        alCrecer.push(avisar);
      }
      observe() {}
      disconnect() {}
    },
  );
  window.history.replaceState({}, '', '/perfil');
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function montar() {
  return renderHook(({ ruta }) => useMemoriaDeDesplazamiento(ruta), { initialProps: { ruta: '/perfil' } });
}

/** Un toque en un enlace a `href` (sin que jsdom intente navegar). */
function tocarEnlace(href: string) {
  const enlace = document.createElement('a');
  enlace.href = href;
  enlace.addEventListener('click', (evento) => evento.preventDefault());
  document.body.append(enlace);
  enlace.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
  enlace.remove();
}

/** La app ya está en `ruta`, con la pantalla todavía cargando. */
function llegarA(ruta: string, rerender: (props: { ruta: string }) => void) {
  window.history.pushState({}, '', ruta);
  alto = PANTALLA;
  rerender({ ruta });
}

/** Termina de cargar: la página mide `nuevoAlto`. */
function crece(nuevoAlto: number) {
  alto = nuevoAlto;
  act(() => alCrecer.forEach((avisar) => avisar()));
}

describe('useMemoriaDeDesplazamiento (prueba en iPhone del 23/10)', () => {
  it('la restauración del navegador queda en manos de la app', () => {
    montar();
    expect(window.history.scrollRestoration).toBe('manual');
  });

  it('de «Soporte» a «Cuenta»: vuelve a donde estaba, cuando la página ya llega tan abajo', () => {
    const { rerender } = montar();
    y = 938;
    alto = 2273;
    tocarEnlace('/soporte');
    llegarA('/soporte', rerender);
    expect(desplazarA).not.toHaveBeenCalledWith(0, 938);

    tocarEnlace('/perfil');
    llegarA('/perfil', rerender);
    // Mientras carga, mide una pantalla: no puede bajar todavía.
    expect(desplazarA).not.toHaveBeenCalledWith(0, 938);
    crece(1200);
    expect(desplazarA).not.toHaveBeenCalledWith(0, 938);
    crece(2273);
    expect(desplazarA).toHaveBeenLastCalledWith(0, 938);
  });

  it('atrás: empieza arriba (nunca más allá del contenido) y baja cuando carga', () => {
    const { rerender } = montar();
    y = 938;
    alto = 2273;
    tocarEnlace('/soporte');
    llegarA('/soporte', rerender);
    y = 300;

    // El gesto de atrás de iOS: el historial avisa antes de que cambie la pantalla.
    window.dispatchEvent(new PopStateEvent('popstate'));
    llegarA('/perfil', rerender);
    expect(desplazarA).toHaveBeenLastCalledWith(0, 0);
    crece(2273);
    expect(desplazarA).toHaveBeenLastCalledWith(0, 938);
  });

  it('si la persona se mueve antes de que cargue, no se le quita el control', () => {
    const { rerender } = montar();
    y = 938;
    alto = 2273;
    tocarEnlace('/soporte');
    llegarA('/soporte', rerender);
    tocarEnlace('/perfil');
    llegarA('/perfil', rerender);

    window.dispatchEvent(new Event('touchstart'));
    crece(2273);
    expect(desplazarA).not.toHaveBeenCalledWith(0, 938);
  });

  it('ir a otro destino y volver tocándolo no es un regreso: queda arriba, como siempre', () => {
    const { rerender } = montar();
    y = 938;
    alto = 2273;
    tocarEnlace('/mapa');
    llegarA('/mapa', rerender);
    tocarEnlace('/perfil');
    llegarA('/perfil', rerender);
    crece(2273);
    expect(desplazarA).not.toHaveBeenCalled();
  });
});

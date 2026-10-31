'use client';

import { useEffect, useRef, useState, type RefObject } from 'react';
import { IDIOMA_DEL_WIDGET, tamanoDelWidget, URL_SCRIPT_CAPTCHA, type ApiDeTurnstile } from '../model/captcha';

type VentanaConCaptcha = Window & { turnstile?: ApiDeTurnstile };

/**
 * Carga del script de Turnstile, compartida por todo el documento: una sola
 * promesa aunque el widget se monte dos veces (StrictMode) o se vuelva a la
 * pantalla. Si falla, se olvida para que el siguiente montaje lo reintente.
 *
 * Se espera al evento `load` del `<script>` y no a `turnstile.ready`: con
 * `render=explicit`, `window.turnstile` ya está listo cuando el script
 * termina de ejecutarse, y `api.js` lanza un error si se llama a `ready`
 * con el script cargado de forma asíncrona (todo `<script>` insertado desde
 * JavaScript lo es). Eso último no está en la guía: se ve en el código de
 * `api.js` (28/10; README, «Captcha en el registro»).
 */
let cargaDelScript: Promise<ApiDeTurnstile> | null = null;

function cargarScriptCaptcha(): Promise<ApiDeTurnstile> {
  if (cargaDelScript) return cargaDelScript;
  cargaDelScript = new Promise<ApiDeTurnstile>((resolver, rechazar) => {
    const ventana = window as VentanaConCaptcha;
    const alListo = () => {
      const api = ventana.turnstile;
      if (api) resolver(api);
      else rechazar(new Error('Turnstile no quedó disponible'));
    };
    if (ventana.turnstile) {
      alListo();
      return;
    }
    let script = document.querySelector<HTMLScriptElement>(`script[src="${URL_SCRIPT_CAPTCHA}"]`);
    if (!script) {
      script = document.createElement('script');
      script.src = URL_SCRIPT_CAPTCHA;
      script.async = true;
      document.head.appendChild(script);
    }
    script.addEventListener('load', alListo, { once: true });
    script.addEventListener(
      'error',
      () => {
        script?.remove();
        rechazar(new Error('No se pudo cargar Turnstile'));
      },
      { once: true },
    );
  }).catch((error: unknown) => {
    cargaDelScript = null;
    throw error;
  });
  return cargaDelScript;
}

/** Solo para tests: olvida la carga compartida entre pruebas. */
export function olvidarCargaDelCaptcha(): void {
  cargaDelScript = null;
}

export type EstadoDelCaptcha = 'cargando' | 'listo' | 'error';

/**
 * NC-08 / NC-08b: pinta el widget de Turnstile dentro de `contenedor` y
 * entrega el token con `onToken` (`null` cuando vence, falla o se reinicia).
 *
 * Cada montaje pinta en un `<div>` hijo NUEVO y, al desmontar, quita el
 * widget con `turnstile.remove` (detiene sus reintentos y renovaciones) y
 * después el `<div>`: en StrictMode el efecto corre dos veces y no se debe
 * pintar dos veces en el mismo elemento.
 *
 * `reinicios` es un contador: cada vez que sube se llama a
 * `turnstile.reset` (el token es de un solo uso y el backend ya lo consumió)
 * y se avisa `onToken(null)`.
 */
export function useCaptcha(
  contenedor: RefObject<HTMLDivElement | null>,
  siteKey: string,
  onToken: (token: string | null) => void,
  reinicios: number,
): EstadoDelCaptcha {
  const [estado, setEstado] = useState<EstadoDelCaptcha>('cargando');
  const api = useRef<ApiDeTurnstile | null>(null);
  const idDelWidget = useRef<string | null>(null);
  // El callback se lee por ref: el widget se pinta una vez y no debe
  // repintarse porque el padre pase una función nueva en cada render.
  const alToken = useRef(onToken);
  useEffect(() => {
    alToken.current = onToken;
  }, [onToken]);

  useEffect(() => {
    const padre = contenedor.current;
    if (!padre) return;
    let vigente = true;
    const destino = document.createElement('div');
    padre.appendChild(destino);
    cargarScriptCaptcha().then(
      (turnstile) => {
        if (!vigente) return;
        api.current = turnstile;
        // `render` lanza ante parámetros que no acepta y puede no devolver
        // id: en los dos casos no hay widget que mostrar ni que reiniciar,
        // así que se avisa como si el script no hubiera cargado.
        let id: string | null = null;
        try {
          id =
            turnstile.render(destino, {
              sitekey: siteKey,
              size: tamanoDelWidget(padre.clientWidth),
              language: IDIOMA_DEL_WIDGET,
              'response-field': false,
              callback: (token) => alToken.current(token),
              'expired-callback': () => alToken.current(null),
              'error-callback': () => alToken.current(null),
            }) || null;
        } catch {
          id = null;
        }
        idDelWidget.current = id;
        setEstado(id === null ? 'error' : 'listo');
      },
      () => {
        if (vigente) setEstado('error');
      },
    );
    return () => {
      vigente = false;
      const id = idDelWidget.current;
      idDelWidget.current = null;
      if (id !== null) api.current?.remove(id);
      destino.remove();
    };
  }, [contenedor, siteKey]);

  useEffect(() => {
    if (reinicios === 0 || idDelWidget.current === null || !api.current) return;
    api.current.reset(idDelWidget.current);
    alToken.current(null);
  }, [reinicios]);

  return estado;
}

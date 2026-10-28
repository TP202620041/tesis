'use client';

import { useEffect, useRef, useState, type RefObject } from 'react';
import { tamanoDelWidget, URL_SCRIPT_CAPTCHA, type ApiDeReCaptcha } from '../model/captcha';

type VentanaConCaptcha = Window & { grecaptcha?: ApiDeReCaptcha };

/**
 * Carga del script de Google, compartida por todo el documento: una sola
 * promesa aunque el widget se monte dos veces (StrictMode) o se vuelva a la
 * pantalla. Si falla, se olvida para que el siguiente montaje lo reintente.
 */
let cargaDelScript: Promise<ApiDeReCaptcha> | null = null;

function cargarScriptCaptcha(): Promise<ApiDeReCaptcha> {
  if (cargaDelScript) return cargaDelScript;
  cargaDelScript = new Promise<ApiDeReCaptcha>((resolver, rechazar) => {
    const ventana = window as VentanaConCaptcha;
    const alListo = () => {
      const api = ventana.grecaptcha;
      if (api) api.ready(() => resolver(api));
      else rechazar(new Error('reCAPTCHA no quedó disponible'));
    };
    if (ventana.grecaptcha) {
      alListo();
      return;
    }
    let script = document.querySelector<HTMLScriptElement>(`script[src="${URL_SCRIPT_CAPTCHA}"]`);
    if (!script) {
      script = document.createElement('script');
      script.src = URL_SCRIPT_CAPTCHA;
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }
    script.addEventListener('load', alListo, { once: true });
    script.addEventListener(
      'error',
      () => {
        script?.remove();
        rechazar(new Error('No se pudo cargar reCAPTCHA'));
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
 * NC-08: pinta el widget de reCAPTCHA v2 dentro de `contenedor` y entrega el
 * token con `onToken` (`null` cuando expira, falla o se reinicia).
 *
 * Cada montaje pinta en un `<div>` hijo NUEVO y lo quita al desmontar:
 * `grecaptcha.render` no admite pintar dos veces en el mismo elemento, y en
 * StrictMode el efecto corre dos veces.
 *
 * `reinicios` es un contador: cada vez que sube se llama a
 * `grecaptcha.reset` (el token es de un solo uso y el backend ya lo
 * consumió) y se avisa `onToken(null)`.
 */
export function useCaptcha(
  contenedor: RefObject<HTMLDivElement | null>,
  siteKey: string,
  onToken: (token: string | null) => void,
  reinicios: number,
): EstadoDelCaptcha {
  const [estado, setEstado] = useState<EstadoDelCaptcha>('cargando');
  const api = useRef<ApiDeReCaptcha | null>(null);
  const idDelWidget = useRef<number | null>(null);
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
      (grecaptcha) => {
        if (!vigente) return;
        api.current = grecaptcha;
        idDelWidget.current = grecaptcha.render(destino, {
          sitekey: siteKey,
          size: tamanoDelWidget(padre.clientWidth),
          callback: (token) => alToken.current(token),
          'expired-callback': () => alToken.current(null),
          'error-callback': () => alToken.current(null),
        });
        setEstado('listo');
      },
      () => {
        if (vigente) setEstado('error');
      },
    );
    return () => {
      vigente = false;
      idDelWidget.current = null;
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

'use client';

import { useRef } from 'react';
import { useCaptcha } from '../hooks/useCaptcha';
import { MENSAJE_CAPTCHA_SIN_CARGAR } from '../model/captcha';

interface CampoCaptchaProps {
  siteKey: string;
  /** Token de la verificación resuelta, o `null` si venció, falló o se reinició. */
  onToken: (token: string | null) => void;
  /**
   * Contador de reinicios: el padre lo sube tras cada error del registro y
   * el widget pide una verificación nueva. Se eligió una prop y no una ref
   * imperativa porque el formulario ya reacciona al error cambiando estado:
   * subir un número es una línea más en ese mismo punto, sin `forwardRef`
   * ni `useImperativeHandle`.
   */
  reinicios: number;
  /** Id del mensaje de error del padre, para `aria-describedby`. */
  idError?: string;
}

/**
 * NC-08 / NC-08b: verificación «No soy un robot» con Cloudflare Turnstile.
 *
 * El widget es un iframe de Cloudflare; su accesibilidad (etiqueta, teclado,
 * anuncios del estado) la da Cloudflare. En modo Managed muchas veces se
 * resuelve solo, sin que la persona marque nada. Aquí se agrupa con un
 * nombre accesible y, si el script no carga, se muestra un texto en vez de
 * un hueco vacío. `overflow-x-auto` es la red de seguridad si ni el tamaño
 * compacto cabe.
 */
export function CampoCaptcha({ siteKey, onToken, reinicios, idError }: CampoCaptchaProps) {
  const contenedor = useRef<HTMLDivElement>(null);
  const estado = useCaptcha(contenedor, siteKey, onToken, reinicios);

  return (
    <div role="group" aria-label="Verificación «No soy un robot»" aria-describedby={idError} className="flex flex-col gap-1">
      <div ref={contenedor} data-testid="captcha" className="max-w-full overflow-x-auto" />
      {estado === 'error' && (
        <p role="alert" className="text-sm text-error">
          {MENSAJE_CAPTCHA_SIN_CARGAR}
        </p>
      )}
    </div>
  );
}

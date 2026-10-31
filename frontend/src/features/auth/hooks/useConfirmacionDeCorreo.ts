'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, mensajeDeError } from '@/lib/api/errors';
import { confirmarCorreo } from '../api';
import {
  estadoTrasErrorDeConfirmacion,
  MENSAJE_ENLACE_INVALIDO,
  tokenDeConfirmacionUsable,
  type EstadoConfirmacion,
} from '../model/confirmacion';

interface Resultado {
  estado: EstadoConfirmacion;
  /** Texto a mostrar; `null` mientras confirma o si salió bien. */
  mensaje: string | null;
}

const INVALIDO: Resultado = { estado: 'invalido', mensaje: MENSAJE_ENLACE_INVALIDO };

/**
 * NC-09: confirma el correo con el token del enlace (`/confirmar-cuenta?token=…`).
 *
 * - **El token se toma una sola vez**, en el primer render. Después se saca
 *   de la URL con `history.replaceState`, antes de llamar al API, para que no
 *   quede en el historial ni viaje en el `Referer`; desde ahí
 *   `useSearchParams` ya no lo trae.
 * - **Una sola llamada**, también con el doble efecto de StrictMode en
 *   desarrollo: `POST /confirmar-correo` no es una lectura que se pueda
 *   repetir y descartar (por eso no usa `useCarga`). Un segundo llamado
 *   daria `CORREO_YA_CONFIRMADO`, que igual cuenta como éxito, pero se evita.
 *   El resultado se descarta solo si el componente se desmontó de verdad.
 * - **Sin token, o con uno imposible** (vacío o de más de 100 caracteres), no
 *   se llama al API: el backend respondería 400 y es el mismo caso que
 *   `CONFIRMACION_INVALIDA`.
 * - No inicia sesión: la página termina con un enlace al login.
 */
export function useConfirmacionDeCorreo(token: string | null) {
  const [tokenInicial] = useState(token);
  const [resultado, setResultado] = useState<Resultado>(() =>
    tokenDeConfirmacionUsable(token) ? { estado: 'confirmando', mensaje: null } : INVALIDO,
  );
  const montado = useRef(false);
  const pedido = useRef(false);

  const confirmar = useCallback(async (valor: string) => {
    try {
      await confirmarCorreo(valor);
      if (montado.current) setResultado({ estado: 'confirmado', mensaje: null });
    } catch (e) {
      if (!montado.current) return;
      if (e instanceof ApiError) {
        const estado = estadoTrasErrorDeConfirmacion(e.status, e.codigo);
        if (estado === 'confirmado') setResultado({ estado, mensaje: null });
        // El 400 trae «Error de validación», que no le dice nada a quien abrió un enlace.
        else if (e.status === 400) setResultado(INVALIDO);
        else setResultado({ estado, mensaje: e.message });
        return;
      }
      setResultado({ estado: 'error', mensaje: mensajeDeError(e).mensaje });
    }
  }, []);

  useEffect(() => {
    montado.current = true;
    quitarTokenDeLaUrl();
    if (!pedido.current && tokenDeConfirmacionUsable(tokenInicial)) {
      pedido.current = true;
      void confirmar(tokenInicial);
    }
    return () => {
      montado.current = false;
    };
  }, [tokenInicial, confirmar]);

  /** Tras un fallo de red o del servidor: vuelve a intentar con el mismo token. */
  const reintentar = useCallback(() => {
    if (!tokenDeConfirmacionUsable(tokenInicial)) return;
    setResultado({ estado: 'confirmando', mensaje: null });
    void confirmar(tokenInicial);
  }, [tokenInicial, confirmar]);

  return { ...resultado, reintentar };
}

/**
 * Saca `token` de la URL sin recargar ni navegar. Next integra
 * `history.replaceState` con su router (la guía «Linking and navigating»),
 * así que `useSearchParams` se entera.
 */
function quitarTokenDeLaUrl(): void {
  const url = new URL(window.location.href);
  if (!url.searchParams.has('token')) return;
  url.searchParams.delete('token');
  window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
}

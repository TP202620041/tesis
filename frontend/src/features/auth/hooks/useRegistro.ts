'use client';

import { useCallback, useState } from 'react';
import { ApiError, mensajeDeError, type MensajeDeError } from '@/lib/api/errors';
import type { CuentaPorConfirmar } from '@/lib/types/domain';
import { textoRechazado as textoRechazadoDe, type TextoRechazado } from '@/lib/types/moderacion';
import { registrar } from '../api';
import { esCorreoRechazado } from '../model/confirmacion';
import { esVersionDeTerminosNoVigente, VERSION_TERMINOS } from '../model/terminos';

export interface DatosDeRegistro {
  nombre: string;
  apellido: string;
  email: string;
  password: string;
}

/**
 * Resultado de un intento de registro. `terminosDesactualizados` viaja aqui
 * (y no solo en el estado del hook) porque quien envia necesita saberlo en
 * el mismo momento: el estado se actualiza despues del render.
 */
export type ResultadoRegistro =
  | { cuenta: CuentaPorConfirmar; terminosDesactualizados: false }
  | { cuenta: null; terminosDesactualizados: boolean };

/**
 * US-01 + NC-07b + NC-09: registra la cuenta con la aceptacion de los
 * terminos.
 *
 * El formulario no deja enviar sin la casilla marcada; aqui se agrega la
 * version que el usuario vio ({@link VERSION_TERMINOS}, la misma que muestra
 * `/privacidad`). Si el backend responde 409 por version no vigente, no se
 * creo la cuenta: `terminosDesactualizados` le dice a la pantalla que debe
 * pedir recargar para leer el texto nuevo (y solo entonces desmarcar la
 * casilla, QA-1 M-2: cualquier otro error, como un correo ya registrado, no
 * invalida la aceptacion).
 *
 * NC-08 / NC-08b: `captchaToken` es el de Cloudflare Turnstile, o `null` si
 * el captcha no esta configurado. Un 409 o 503 del captcha se muestra como
 * cualquier otro error (`mensajeDeError`); reiniciar el widget le toca al
 * formulario.
 *
 * NC-09: si sale bien NO hay sesion: devuelve la {@link CuentaPorConfirmar}
 * (correo y vigencia del enlace) para la pantalla «Revisa tu correo». Los
 * 409 del dominio del correo (`CORREO_DESECHABLE`, `DOMINIO_SIN_CORREO`) van
 * en `errorDelCorreo`, para mostrarlos en el campo, y no en `error`.
 *
 * NC-10c: el 400 `TEXTO_NO_PERMITIDO` del nombre o del apellido va en
 * `textoRechazado` (campo, mensaje y lo que se envio), para el campo. El
 * captcha sigue primero en el backend: sin token valido llega su 409 antes.
 */
export function useRegistro() {
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<MensajeDeError | null>(null);
  const [errorDelCorreo, setErrorDelCorreo] = useState<string | null>(null);
  const [textoRechazado, setTextoRechazado] = useState<TextoRechazado | null>(null);
  const [terminosDesactualizados, setTerminosDesactualizados] = useState(false);

  const enviar = useCallback(
    async (datos: DatosDeRegistro, captchaToken: string | null = null): Promise<ResultadoRegistro> => {
      setError(null);
      setErrorDelCorreo(null);
      setTextoRechazado(null);
      setTerminosDesactualizados(false);
      setEnviando(true);
      try {
        const cuenta = await registrar({
          ...datos,
          aceptaTerminos: true,
          versionTerminos: VERSION_TERMINOS,
          // NC-08: solo si el captcha esta configurado; sin el, el backend
          // local (`CAPTCHA_TIPO=ninguno`) no lo pide.
          ...(captchaToken ? { captchaToken } : {}),
        });
        return { cuenta, terminosDesactualizados: false };
      } catch (e) {
        // 409 = correo ya registrado, version de terminos no vigente o (NC-09)
        // dominio del correo rechazado; 400 = validacion (`details` trae el
        // detalle por campo de @Valid).
        if (e instanceof ApiError && esCorreoRechazado(e.status, e.codigo)) {
          setErrorDelCorreo(e.message);
          return { cuenta: null, terminosDesactualizados: false };
        }
        const rechazo =
          e instanceof ApiError
            ? textoRechazadoDe(e, { nombre: datos.nombre, apellido: datos.apellido })
            : null;
        if (rechazo) {
          setTextoRechazado(rechazo);
          return { cuenta: null, terminosDesactualizados: false };
        }
        const desactualizados = e instanceof ApiError && esVersionDeTerminosNoVigente(e.status, e.message);
        setError(mensajeDeError(e));
        setTerminosDesactualizados(desactualizados);
        return { cuenta: null, terminosDesactualizados: desactualizados };
      } finally {
        setEnviando(false);
      }
    },
    [],
  );

  return { enviando, error, errorDelCorreo, textoRechazado, terminosDesactualizados, enviar };
}

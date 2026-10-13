'use client';

import { useCallback, useState } from 'react';
import { mensajeDeError, type MensajeDeError } from '@/lib/api/errors';
import { restablecerPassword, solicitarRecuperacion } from '../api';
import { erroresDePasswordNueva, normalizarToken } from '../model/password';

/**
 * Pasos de la recuperación (US-03). El correo trae un token para pegar en la
 * app, no un enlace, así que todo ocurre en una sola pantalla.
 */
export type PasoRecuperacion = 'correo' | 'token' | 'listo';

/**
 * US-03: orquesta los dos pasos de la recuperación de contraseña.
 *
 * El paso 1 avanza siempre que el backend responda 202, exista o no la
 * cuenta: la pantalla dice "si el correo está registrado…" y nunca confirma
 * que lo esté (el backend tampoco lo revela).
 */
export function useRecuperarPassword() {
  const [paso, setPaso] = useState<PasoRecuperacion>('correo');
  const [correo, setCorreo] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<MensajeDeError | null>(null);

  const pedirToken = useCallback(async (email: string) => {
    setError(null);
    setEnviando(true);
    try {
      await solicitarRecuperacion({ email: email.trim() });
      setCorreo(email.trim());
      setPaso('token');
    } catch (e) {
      setError(mensajeDeError(e));
    } finally {
      setEnviando(false);
    }
  }, []);

  const restablecer = useCallback(
    async (token: string, password: string, confirmacion: string) => {
      setError(null);
      const errores = erroresDePasswordNueva(password, confirmacion);
      const tokenLimpio = normalizarToken(token);
      if (!tokenLimpio) errores.unshift('Ingresa el token que recibiste por correo.');
      if (errores.length > 0) {
        setError({ mensaje: 'Revisa los datos antes de continuar.', detalles: errores });
        return;
      }
      setEnviando(true);
      try {
        await restablecerPassword({ token: tokenLimpio, nuevaPassword: password });
        setPaso('listo');
      } catch (e) {
        // 404 = token inválido; 409 = vencido o ya usado. El mensaje del
        // backend ya lo dice en cada caso.
        setError(mensajeDeError(e));
      } finally {
        setEnviando(false);
      }
    },
    [],
  );

  /** Cambia de paso a mano: "ya tengo un token" o "volver a pedirlo". */
  const irAPaso = useCallback((destino: Exclude<PasoRecuperacion, 'listo'>) => {
    setError(null);
    setPaso(destino);
  }, []);

  return { paso, correo, enviando, error, pedirToken, restablecer, irAPaso };
}

'use client';

import { useCallback, useState } from 'react';
import { mensajeDeError, type MensajeDeError } from '@/lib/api/errors';
import type { LoginRequest, SesionIniciada } from '@/lib/types/domain';
import { iniciarSesion } from '../api';

/**
 * US-02: inicia sesion y expone el error ya traducido.
 *
 * El backend responde 401 con «Credenciales invalidas» ante correo
 * inexistente o contrasena incorrecta, sin distinguir cual (no revela que
 * cuentas existen). El manejo centralizado del 401 no navega estando ya en
 * `/login`, asi que el error llega aqui y se muestra en el formulario.
 */
export function useIniciarSesion() {
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<MensajeDeError | null>(null);

  const enviar = useCallback(async (datos: LoginRequest): Promise<SesionIniciada | null> => {
    setError(null);
    setEnviando(true);
    try {
      return await iniciarSesion(datos);
    } catch (e) {
      setError(mensajeDeError(e));
      return null;
    } finally {
      setEnviando(false);
    }
  }, []);

  return { enviando, error, enviar };
}

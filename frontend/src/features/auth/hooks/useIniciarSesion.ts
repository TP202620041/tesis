'use client';

import { useCallback, useState } from 'react';
import { ApiError, mensajeDeError, type MensajeDeError } from '@/lib/api/errors';
import type { LoginRequest, SesionIniciada } from '@/lib/types/domain';
import { iniciarSesion } from '../api';
import { esCorreoSinConfirmar } from '../model/confirmacion';
import { reRegistrarPushAlIniciarSesion } from './push';

/**
 * US-02: inicia sesion y expone el error ya traducido.
 *
 * El backend responde 401 con «Credenciales invalidas» ante correo
 * inexistente o contrasena incorrecta, sin distinguir cual (no revela que
 * cuentas existen). El manejo centralizado del 401 no navega estando ya en
 * `/login`, asi que el error llega aqui y se muestra en el formulario.
 *
 * NC-09: con la contrasena correcta y la cuenta sin confirmar, 409
 * `CORREO_NO_CONFIRMADO`. Entonces `correoSinConfirmar` trae el correo que
 * se envio (no el que haya en el campo despues), para ofrecer «Reenviar el
 * enlace» a esa direccion. El backend solo llega a ese 409 si la contrasena
 * es correcta, asi que mostrarlo no revela nada a quien no la sabe.
 */
export function useIniciarSesion() {
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<MensajeDeError | null>(null);
  const [correoSinConfirmar, setCorreoSinConfirmar] = useState<string | null>(null);

  const enviar = useCallback(async (datos: LoginRequest): Promise<SesionIniciada | null> => {
    setError(null);
    setCorreoSinConfirmar(null);
    setEnviando(true);
    try {
      const sesion = await iniciarSesion(datos);
      // US-21: si este navegador ya tenia push, se reasigna al usuario que
      // entra (y se renueva si cambiaron las claves VAPID). En segundo plano
      // y sin esperar. Con los terminos pendientes el backend lo rechazaria
      // (403): se hace al aceptarlos (`useAceptarTerminos`).
      if (!sesion.usuario.debeAceptarTerminos) void reRegistrarPushAlIniciarSesion();
      return sesion;
    } catch (e) {
      setError(mensajeDeError(e));
      if (e instanceof ApiError && esCorreoSinConfirmar(e.status, e.codigo)) {
        setCorreoSinConfirmar(datos.email.trim());
      }
      return null;
    } finally {
      setEnviando(false);
    }
  }, []);

  return { enviando, error, correoSinConfirmar, enviar };
}

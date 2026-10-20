'use client';

import { useCallback, useState } from 'react';
import { ApiError, mensajeDeError, type MensajeDeError } from '@/lib/api/errors';
import type { SesionIniciada } from '@/lib/types/domain';
import { registrar } from '../api';
import { esVersionDeTerminosNoVigente, VERSION_TERMINOS } from '../model/terminos';

export interface DatosDeRegistro {
  nombre: string;
  apellido: string;
  email: string;
  password: string;
}

/**
 * US-01 + NC-07b: registra la cuenta con la aceptacion de los terminos.
 *
 * El formulario no deja enviar sin la casilla marcada; aqui se agrega la
 * version que el usuario vio ({@link VERSION_TERMINOS}, la misma que muestra
 * `/privacidad`). Si el backend responde 409 por version no vigente, no se
 * creo la cuenta: `terminosDesactualizados` le dice a la pantalla que debe
 * pedir recargar para leer el texto nuevo.
 */
export function useRegistro() {
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<MensajeDeError | null>(null);
  const [terminosDesactualizados, setTerminosDesactualizados] = useState(false);

  const enviar = useCallback(async (datos: DatosDeRegistro): Promise<SesionIniciada | null> => {
    setError(null);
    setTerminosDesactualizados(false);
    setEnviando(true);
    try {
      return await registrar({ ...datos, aceptaTerminos: true, versionTerminos: VERSION_TERMINOS });
    } catch (e) {
      // 409 = correo ya registrado o version de terminos no vigente; 400 =
      // validacion (`details` trae el detalle por campo de @Valid).
      setError(mensajeDeError(e));
      setTerminosDesactualizados(e instanceof ApiError && esVersionDeTerminosNoVigente(e.status, e.message));
      return null;
    } finally {
      setEnviando(false);
    }
  }, []);

  return { enviando, error, terminosDesactualizados, enviar };
}

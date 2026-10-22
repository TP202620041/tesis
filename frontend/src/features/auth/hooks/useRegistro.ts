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
 * Resultado de un intento de registro. `terminosDesactualizados` viaja aqui
 * (y no solo en el estado del hook) porque quien envia necesita saberlo en
 * el mismo momento: el estado se actualiza despues del render.
 */
export type ResultadoRegistro =
  | { sesion: SesionIniciada; terminosDesactualizados: false }
  | { sesion: null; terminosDesactualizados: boolean };

/**
 * US-01 + NC-07b: registra la cuenta con la aceptacion de los terminos.
 *
 * El formulario no deja enviar sin la casilla marcada; aqui se agrega la
 * version que el usuario vio ({@link VERSION_TERMINOS}, la misma que muestra
 * `/privacidad`). Si el backend responde 409 por version no vigente, no se
 * creo la cuenta: `terminosDesactualizados` le dice a la pantalla que debe
 * pedir recargar para leer el texto nuevo (y solo entonces desmarcar la
 * casilla, QA-1 M-2: cualquier otro error, como un correo ya registrado, no
 * invalida la aceptacion).
 */
export function useRegistro() {
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<MensajeDeError | null>(null);
  const [terminosDesactualizados, setTerminosDesactualizados] = useState(false);

  const enviar = useCallback(async (datos: DatosDeRegistro): Promise<ResultadoRegistro> => {
    setError(null);
    setTerminosDesactualizados(false);
    setEnviando(true);
    try {
      const sesion = await registrar({ ...datos, aceptaTerminos: true, versionTerminos: VERSION_TERMINOS });
      return { sesion, terminosDesactualizados: false };
    } catch (e) {
      // 409 = correo ya registrado o version de terminos no vigente; 400 =
      // validacion (`details` trae el detalle por campo de @Valid).
      const desactualizados = e instanceof ApiError && esVersionDeTerminosNoVigente(e.status, e.message);
      setError(mensajeDeError(e));
      setTerminosDesactualizados(desactualizados);
      return { sesion: null, terminosDesactualizados: desactualizados };
    } finally {
      setEnviando(false);
    }
  }, []);

  return { enviando, error, terminosDesactualizados, enviar };
}

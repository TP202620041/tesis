'use client';

import { useCallback, useState } from 'react';
import { mensajeDeError, type MensajeDeError } from '@/lib/api/errors';
import { useCarga } from '@/lib/hooks/useCarga';
import { aceptarConsentimiento, obtenerConsentimientos, revocarConsentimiento } from '../api';
import {
  versionDeAviso,
  type Consentimientos,
  type FinalidadOpcional,
} from '../model/consentimientos';

/**
 * NC-07b: consentimientos del usuario (perfil, «Privacidad y
 * consentimientos») y las acciones para otorgar o revocar los opcionales.
 *
 * Tras cada accion se recarga del servidor en vez de suponer el resultado:
 * revocar push, por ejemplo, tambien borra suscripciones, y la lista que se
 * muestra debe ser la que el backend guardo.
 */
export function useConsentimientos() {
  const carga = useCarga<Consentimientos>(() => obtenerConsentimientos(), []);
  const [procesando, setProcesando] = useState<FinalidadOpcional | null>(null);
  const [error, setError] = useState<MensajeDeError | null>(null);
  const { recargar } = carga;

  const ejecutar = useCallback(
    async (finalidad: FinalidadOpcional, accion: () => Promise<void>): Promise<boolean> => {
      setError(null);
      setProcesando(finalidad);
      try {
        await accion();
        return true;
      } catch (e) {
        setError(mensajeDeError(e));
        return false;
      } finally {
        setProcesando(null);
        recargar();
      }
    },
    [recargar],
  );

  /** Otorga un aviso opcional con la version del texto que se le mostro. */
  const otorgar = useCallback(
    (finalidad: FinalidadOpcional) =>
      ejecutar(finalidad, () => aceptarConsentimiento(finalidad, versionDeAviso(finalidad))),
    [ejecutar],
  );

  const revocar = useCallback(
    (finalidad: FinalidadOpcional) => ejecutar(finalidad, () => revocarConsentimiento(finalidad)),
    [ejecutar],
  );

  return { carga, procesando, error, otorgar, revocar };
}

export type EstadoConsentimientos = ReturnType<typeof useConsentimientos>;

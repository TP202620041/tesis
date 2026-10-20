'use client';

import { useCallback, useState } from 'react';
import { mensajeDeError, type MensajeDeError } from '@/lib/api/errors';
import { useCarga } from '@/lib/hooks/useCarga';
import { aceptarConsentimiento, obtenerConsentimientos } from '../api';
import { versionDeAviso, type FinalidadOpcional } from '../model/consentimientos';
import { reRegistrarPushAlIniciarSesion } from './push';

/** Resultado de aceptar: los avisos opcionales que no se pudieron guardar. */
export interface ResultadoAceptacion {
  avisosFallidos: FinalidadOpcional[];
}

/**
 * NC-07b (D-12): pantalla de aceptacion para quien tiene
 * `debeAceptarTerminos`. Lee la version vigente del API (con sesion si se
 * puede: no se usa la constante del registro) y acepta los terminos y, si el
 * usuario los marco, los avisos opcionales.
 *
 * Los terminos van primero y solos: si fallan, no se guarda nada mas. Un
 * aviso opcional que falla no deshace la aceptacion de los terminos: se
 * informa y el usuario puede otorgarlo despues desde su perfil.
 */
export function useAceptarTerminos() {
  const carga = useCarga(() => obtenerConsentimientos(), []);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<MensajeDeError | null>(null);
  const version = carga.datos?.versionTerminosVigente ?? null;

  const aceptar = useCallback(
    async (opcionales: readonly FinalidadOpcional[]): Promise<ResultadoAceptacion | null> => {
      if (!version) return null;
      setError(null);
      setEnviando(true);
      try {
        try {
          await aceptarConsentimiento('TERMINOS_Y_PRIVACIDAD', version);
        } catch (e) {
          setError(mensajeDeError(e));
          return null;
        }
        const avisosFallidos: FinalidadOpcional[] = [];
        for (const finalidad of opcionales) {
          try {
            await aceptarConsentimiento(finalidad, versionDeAviso(finalidad));
          } catch {
            avisosFallidos.push(finalidad);
          }
        }
        // US-21: lo que el inicio de sesion no pudo hacer con los terminos
        // pendientes (reasignar el push de este navegador), en segundo plano.
        void reRegistrarPushAlIniciarSesion();
        return { avisosFallidos };
      } finally {
        setEnviando(false);
      }
    },
    [version],
  );

  return { carga, version, enviando, error, aceptar };
}

'use client';

import { useCallback, useState } from 'react';
import { ApiError, mensajeDeError } from '@/lib/api/errors';
import { denunciarReporte } from '../api';
import { esDenunciaDefinitiva, mensajeDeDenunciaRechazada } from '../model/denuncia';
import type { DenunciaRegistrada, NuevaDenuncia } from '../model/tipos';

export interface ErrorDeDenuncia {
  mensaje: string;
  /** `true` si no tiene sentido reintentar (ya denunciaste, es tu reporte). */
  definitivo: boolean;
}

/**
 * NC-11b (D-15): envia la denuncia de un reporte publicado. Devuelve la
 * denuncia registrada (201) o deja en `error` el mensaje por `codigo`
 * (`model/denuncia.ts`); un fallo que no es del contrato se traduce con
 * `mensajeDeError`, como cualquier otro.
 */
export function useDenunciarReporte(reporteId: number) {
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<ErrorDeDenuncia | null>(null);
  const [registrada, setRegistrada] = useState<DenunciaRegistrada | null>(null);

  const denunciar = useCallback(
    async (denuncia: NuevaDenuncia): Promise<boolean> => {
      setError(null);
      setEnviando(true);
      try {
        setRegistrada(await denunciarReporte(reporteId, denuncia));
        return true;
      } catch (e) {
        const propio = e instanceof ApiError ? mensajeDeDenunciaRechazada(e) : null;
        setError({
          mensaje: propio ?? mensajeDeError(e).mensaje,
          definitivo: e instanceof ApiError && esDenunciaDefinitiva(e),
        });
        return false;
      } finally {
        setEnviando(false);
      }
    },
    [reporteId],
  );

  const reiniciar = useCallback(() => {
    setError(null);
    setRegistrada(null);
  }, []);

  return { denunciar, enviando, error, registrada, reiniciar };
}

'use client';

import { useCallback, useState } from 'react';
import { mensajeDeError, type MensajeDeError } from '@/lib/api/errors';
import { cambiarActivaCategoria } from '../api';

/** US-29: activa o desactiva una categoría personalizada. Devuelve `true` si se guardó. */
export function useCambiarActivaCategoria() {
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<MensajeDeError | null>(null);

  const cambiar = useCallback(async (id: number, activa: boolean) => {
    setError(null);
    setEnviando(true);
    try {
      await cambiarActivaCategoria(id, activa);
      return true;
    } catch (e) {
      setError(mensajeDeError(e));
      return false;
    } finally {
      setEnviando(false);
    }
  }, []);

  return { cambiar, enviando, error };
}

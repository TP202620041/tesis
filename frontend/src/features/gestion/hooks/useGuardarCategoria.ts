'use client';

import { useCallback, useState } from 'react';
import { mensajeDeError, type MensajeDeError } from '@/lib/api/errors';
import { crearCategoria, editarCategoria } from '../api';
import { erroresDeCategoria, type DatosCategoria } from '../model/categorias';

/**
 * US-29: crea (`id` null) o edita una categoría personalizada. Devuelve
 * `true` si se guardó. Los 403/404/409 del backend llegan con su mensaje
 * (estándar, otro distrito, inexistente, nombre repetido).
 */
export function useGuardarCategoria() {
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<MensajeDeError | null>(null);

  const guardar = useCallback(async (id: number | null, datos: DatosCategoria) => {
    setError(null);
    const errores = erroresDeCategoria(datos);
    if (errores.length > 0) {
      setError({ mensaje: 'Revisa los datos de la categoría.', detalles: errores });
      return false;
    }
    setEnviando(true);
    try {
      if (id == null) await crearCategoria(datos);
      else await editarCategoria(id, datos);
      return true;
    } catch (e) {
      setError(mensajeDeError(e));
      return false;
    } finally {
      setEnviando(false);
    }
  }, []);

  const limpiarError = useCallback(() => setError(null), []);

  return { guardar, enviando, error, limpiarError };
}

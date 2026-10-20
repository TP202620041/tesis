'use client';

import { useCallback, useState } from 'react';
import { listarDistritos } from '@/lib/api/catalogos';
import { mensajeDeError, NetworkError, type MensajeDeError } from '@/lib/api/errors';
import { useCarga } from '@/lib/hooks/useCarga';
import type { Distrito, PreferenciaNotificacion, Usuario } from '@/lib/types/domain';
import { actualizarPreferenciaNotificacion, editarPerfil, type CambiosDePerfil } from '../api';

const SIN_DISTRITOS: Distrito[] = [];

/** US-30: distritos del selector de residencia. Si falla, solo "Sin especificar". */
export function useDistritosDeResidencia(): Distrito[] {
  const carga = useCarga<Distrito[]>(() => listarDistritos().catch(() => [] as Distrito[]), []);
  return carga.datos ?? SIN_DISTRITOS;
}

/**
 * Traduce el error con `mensajeDeError`, conservando el texto que esta
 * pantalla ya mostraba sin conexion.
 */
function errorDePerfil(e: unknown): MensajeDeError {
  if (e instanceof NetworkError) return { mensaje: 'Sin conexión con el servidor.', detalles: [] };
  return mensajeDeError(e);
}

/**
 * US-30: el ciudadano edita sus datos y su foto (`guardar`) y su preferencia
 * de aviso (`cambiarPreferencia`). `usuario` es siempre la ultima version que
 * devolvio el servidor.
 */
export function usePerfil(inicial: Usuario) {
  const [usuario, setUsuario] = useState<Usuario>(inicial);
  const [guardando, setGuardando] = useState(false);
  const [guardado, setGuardado] = useState(false);
  const [error, setError] = useState<MensajeDeError | null>(null);

  /** Devuelve `true` si se guardo (el componente limpia entonces la foto elegida). */
  const guardar = useCallback(async (cambios: CambiosDePerfil): Promise<boolean> => {
    setError(null);
    setGuardado(false);
    setGuardando(true);
    try {
      setUsuario(await editarPerfil(cambios));
      setGuardado(true);
      return true;
    } catch (e) {
      setError(errorDePerfil(e));
      return false;
    } finally {
      setGuardando(false);
    }
  }, []);

  const cambiarPreferencia = useCallback(async (preferencia: PreferenciaNotificacion) => {
    setError(null);
    try {
      // Endpoint aparte del resto del perfil: la preferencia se guarda al
      // instante, sin obligar a pulsar "Guardar cambios".
      setUsuario(await actualizarPreferenciaNotificacion(preferencia));
    } catch (e) {
      setError(errorDePerfil(e));
    }
  }, []);

  return { usuario, guardando, guardado, error, guardar, cambiarPreferencia };
}

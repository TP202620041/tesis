'use client';

import { useCarga } from '@/lib/hooks/useCarga';
import { obtenerUsuarioActual } from '../api';
import { haySesion } from '@/lib/auth/token-storage';
import type { Usuario } from '@/lib/types/domain';

export type EstadoSesion =
  | { estado: 'cargando' }
  | { estado: 'autenticado'; usuario: Usuario }
  | { estado: 'anonimo' };

/**
 * Sesion del usuario segun el token guardado.
 *
 * No decodifica el JWT en el cliente: pregunta a `GET /api/auth/me`. Un token
 * puede estar presente pero vencido o revocado, y solo el backend puede
 * decirlo — confiar en el payload local dejaria ver pantallas de sesion
 * iniciada a alguien cuyo token ya no sirve.
 *
 * El 401 lo maneja el cliente HTTP (limpia el token y redirige al login), asi
 * que aqui solo hay que distinguir "hay usuario" de "no hay".
 *
 * Va sobre `useCarga` (cancelacion y recarga). Cualquier fallo de la consulta
 * cuenta como "sin sesion" (`null`), nunca como error: asi la carga nunca
 * queda en `error` y `refrescar()` conserva el estado anterior visible hasta
 * que llega la respuesta, igual que antes de usar `useCarga`.
 */
export function useSesion(): EstadoSesion & { refrescar: () => void } {
  const carga = useCarga<Usuario | null>(
    () => (haySesion() ? obtenerUsuarioActual().catch(() => null) : Promise.resolve(null)),
    [],
  );
  const refrescar = carga.recargar;

  if (carga.estado !== 'listo') return { estado: 'cargando', refrescar };
  if (carga.datos === null) return { estado: 'anonimo', refrescar };
  return { estado: 'autenticado', usuario: carga.datos, refrescar };
}

'use client';

import { useCallback, useEffect, useState } from 'react';
import { obtenerUsuarioActual } from './api';
import { haySesion } from '@/lib/auth/token-storage';
import type { Usuario } from '@/lib/types/domain';

type EstadoSesion =
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
 */
export function useSesion(): EstadoSesion & { refrescar: () => void } {
  const [estado, setEstado] = useState<EstadoSesion>({ estado: 'cargando' });
  // Cambiarlo fuerza al efecto a volver a consultar, sin que el hook tenga
  // que llamar a setState de forma sincrona dentro del propio efecto.
  const [intento, setIntento] = useState(0);

  useEffect(() => {
    // `cancelado` evita escribir estado si el componente se desmonta o si
    // llega otro intento mientras este seguia en vuelo.
    let cancelado = false;

    // Todo el trabajo ocurre dentro de esta funcion asincrona: el estado
    // nunca se escribe de forma sincrona durante el efecto, que es lo que
    // React desaconseja (provoca un render extra antes de pintar).
    const cargar = async () => {
      if (!haySesion()) {
        if (!cancelado) setEstado({ estado: 'anonimo' });
        return;
      }
      try {
        const usuario = await obtenerUsuarioActual();
        if (!cancelado) setEstado({ estado: 'autenticado', usuario });
      } catch {
        if (!cancelado) setEstado({ estado: 'anonimo' });
      }
    };

    void cargar();

    return () => {
      cancelado = true;
    };
  }, [intento]);

  const refrescar = useCallback(() => setIntento((n) => n + 1), []);

  return { ...estado, refrescar };
}

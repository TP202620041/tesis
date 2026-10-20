'use client';

import { useCallback, useState } from 'react';
import { distritoPorCoordenadas } from '@/lib/api/catalogos';
import type { Distrito } from '@/lib/types/domain';
import type { Coordenadas } from '@/map/MapaSelectorUbicacion';

/**
 * US-05: distrito al que ira el reporte segun el punto elegido.
 *
 * Se le pregunta al backend: es el mismo `ST_Covers` que usara al crear el
 * reporte, asi que lo que se muestra no puede discrepar de la asignacion
 * real. `resolver` devuelve `null` si el punto esta fuera de cobertura y
 * tambien ante un fallo de red: ese fallo no debe impedir reportar, porque
 * el backend asignara el distrito igual al recibir el POST.
 *
 * Como `useGeolocalizacion`, devuelve una promesa para que el componente
 * encadene la reaccion en el propio manejador del evento.
 */
export function useDistritoDeUbicacion() {
  const [resolviendo, setResolviendo] = useState(false);

  const resolver = useCallback(async (coordenadas: Coordenadas): Promise<Distrito | null> => {
    setResolviendo(true);
    try {
      return await distritoPorCoordenadas(coordenadas.latitud, coordenadas.longitud);
    } catch {
      return null;
    } finally {
      setResolviendo(false);
    }
  }, []);

  return { resolviendo, resolver };
}

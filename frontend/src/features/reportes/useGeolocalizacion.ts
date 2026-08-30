'use client';

import { useCallback, useState } from 'react';
import type { Coordenadas } from '@/map/MapaSelectorUbicacion';

/**
 * Lectura del GPS del navegador (US-05).
 *
 * El escenario 2 de US-05 —GPS no disponible— no es un caso raro: en la
 * calle el permiso puede estar denegado, el dispositivo sin senal o el
 * navegador servido sin HTTPS (la API exige contexto seguro). Por eso el
 * fallo NO se trata como error fatal: se expone un motivo legible y el
 * formulario ofrece marcar el punto a mano en el mapa.
 *
 * `localizar()` devuelve una promesa en vez de exponer solo estado. Asi
 * quien llama encadena la reaccion en el propio manejador del evento
 * ("obtuve el punto, resuelvo el distrito") en lugar de observar el estado
 * desde un `useEffect`, que ademas obligaria a escribir estado durante el
 * efecto — algo que React desaconseja porque provoca un render extra.
 */

type EstadoGeo =
  | { estado: 'inactivo' }
  | { estado: 'localizando' }
  | { estado: 'obtenida'; precisionMetros: number }
  | { estado: 'fallida'; motivo: string };

export function useGeolocalizacion() {
  const [estado, setEstado] = useState<EstadoGeo>({ estado: 'inactivo' });

  /** Resuelve con las coordenadas, o con `null` si no se pudo obtener. */
  const localizar = useCallback((): Promise<Coordenadas | null> => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setEstado({
        estado: 'fallida',
        motivo: 'Tu navegador no permite obtener la ubicación automáticamente.',
      });
      return Promise.resolve(null);
    }

    setEstado({ estado: 'localizando' });

    return new Promise((resolver) => {
      navigator.geolocation.getCurrentPosition(
        (posicion) => {
          setEstado({
            estado: 'obtenida',
            precisionMetros: Math.round(posicion.coords.accuracy),
          });
          resolver({
            latitud: posicion.coords.latitude,
            longitud: posicion.coords.longitude,
          });
        },
        (error) => {
          setEstado({ estado: 'fallida', motivo: motivoLegible(error) });
          resolver(null);
        },
        {
          // Reportar un bache exige precision de metros, no de manzana.
          enableHighAccuracy: true,
          timeout: 15_000,
          // Una lectura de hace un minuto sigue sirviendo y evita esperar.
          maximumAge: 60_000,
        },
      );
    });
  }, []);

  return { ...estado, localizar };
}

function motivoLegible(error: GeolocationPositionError): string {
  switch (error.code) {
    case error.PERMISSION_DENIED:
      return 'No diste permiso de ubicación. Puedes marcar el punto en el mapa.';
    case error.POSITION_UNAVAILABLE:
      return 'No se pudo determinar tu ubicación. Puedes marcarla en el mapa.';
    case error.TIMEOUT:
      return 'La búsqueda de tu ubicación tardó demasiado. Puedes marcarla en el mapa.';
    default:
      return 'No se pudo obtener tu ubicación. Puedes marcarla en el mapa.';
  }
}

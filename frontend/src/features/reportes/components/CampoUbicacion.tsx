'use client';

import dynamic from 'next/dynamic';
import { useState } from 'react';
import { useDistritoDeUbicacion } from '../hooks/useDistritoDeUbicacion';
import { useGeolocalizacion } from '../hooks/useGeolocalizacion';
import type { Coordenadas } from '@/map/MapaSelectorUbicacion';
import type { Distrito } from '@/lib/types/domain';
import { clasesDeBoton } from '@/components/ui/Boton';

/**
 * Leaflet toca el DOM al construirse, asi que el mapa no puede renderizarse
 * en el servidor.
 */
const MapaSelectorUbicacion = dynamic(() => import('@/map/MapaSelectorUbicacion'), {
  ssr: false,
  loading: () => (
    <div className="h-80 w-full animate-pulse rounded-control bg-superficie-2" />
  ),
});

export interface UbicacionElegida {
  coordenadas: Coordenadas;
  /** true si el ciudadano marco el punto a mano en vez de usar el GPS. */
  manual: boolean;
  /** Distrito resuelto por el backend; `null` = fuera de cobertura. */
  distrito: Distrito | null;
}

interface Props {
  valor: UbicacionElegida | null;
  onCambiar: (ubicacion: UbicacionElegida | null) => void;
}

export function CampoUbicacion({ valor, onCambiar }: Props) {
  const geo = useGeolocalizacion();
  const [mostrarMapa, setMostrarMapa] = useState(false);
  const { resolviendo, resolver } = useDistritoDeUbicacion();

  /**
   * Pide el GPS y encadena la reaccion aqui mismo, en el manejador del
   * evento: si da un punto se adopta; si falla se abre el mapa, que es la
   * salida del escenario 2 de US-05.
   */
  async function usarGps() {
    const coordenadas = await geo.localizar();
    if (coordenadas) {
      await aplicar(coordenadas, false);
    } else {
      setMostrarMapa(true);
    }
  }

  async function aplicar(coordenadas: Coordenadas, manual: boolean) {
    // `resolver` nunca rechaza: fuera de cobertura o sin red devuelve null
    // (ver useDistritoDeUbicacion).
    const distrito = await resolver(coordenadas);
    onCambiar({ coordenadas, manual, distrito });
  }

  return (
    <div className="flex flex-col gap-3">
      <span className="text-sm font-medium text-texto">Ubicación</span>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void usarGps()}
          disabled={geo.estado === 'localizando'}
          className={clasesDeBoton('primario', 'compacto')}
        >
          {geo.estado === 'localizando' ? 'Buscando tu ubicación…' : 'Usar mi ubicación (GPS)'}
        </button>
        <button
          type="button"
          onClick={() => setMostrarMapa((v) => !v)}
          className={clasesDeBoton('secundario', 'compacto')}
        >
          {mostrarMapa ? 'Ocultar mapa' : 'Marcar en el mapa'}
        </button>
      </div>

      {geo.estado === 'fallida' && (
        <p role="status" className="text-sm text-aviso-texto">
          {geo.motivo}
        </p>
      )}

      {mostrarMapa && (
        <div className="flex flex-col gap-1">
          <MapaSelectorUbicacion
            valor={valor?.coordenadas ?? null}
            onSeleccionar={(c) => void aplicar(c, true)}
          />
          <p className="text-xs text-texto-2">
            Toca el mapa para marcar dónde está el daño.
          </p>
        </div>
      )}

      {valor && (
        <div className="rounded-control border border-linea bg-superficie p-3 text-sm">
          <p className="text-texto">
            {valor.coordenadas.latitud.toFixed(5)}, {valor.coordenadas.longitud.toFixed(5)}
            {valor.manual ? ' · marcada en el mapa' : ' · obtenida por GPS'}
            {geo.estado === 'obtenida' && !valor.manual && ` · ±${geo.precisionMetros} m`}
          </p>

          {resolviendo ? (
            <p className="mt-1 text-texto-2">Verificando distrito…</p>
          ) : valor.distrito ? (
            // Hace visible la restriccion clave del proyecto: la asignacion es
            // automatica y el ciudadano no elige municipalidad.
            <p className="mt-1 text-texto-2">
              Se enviará a la{' '}
              <strong className="text-texto">
                Municipalidad de {valor.distrito.nombre}
              </strong>
            </p>
          ) : (
            <p role="alert" className="mt-1 text-error">
              Esta ubicación está fuera de Lima Metropolitana. Elige un punto dentro de la
              cobertura.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

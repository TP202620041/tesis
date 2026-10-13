'use client';

import dynamic from 'next/dynamic';
import { useState } from 'react';
import { distritoPorCoordenadas } from '@/features/distritos/api';
import { useGeolocalizacion } from '../useGeolocalizacion';
import type { Coordenadas } from '@/map/MapaSelectorUbicacion';
import type { Distrito } from '@/lib/types/domain';

/**
 * Leaflet toca el DOM al construirse, asi que el mapa no puede renderizarse
 * en el servidor.
 */
const MapaSelectorUbicacion = dynamic(() => import('@/map/MapaSelectorUbicacion'), {
  ssr: false,
  loading: () => (
    <div className="h-80 w-full animate-pulse rounded-md bg-slate-200 dark:bg-slate-700" />
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
  const [resolviendo, setResolviendo] = useState(false);

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
    setResolviendo(true);
    try {
      // Se le pregunta al backend: es el mismo ST_Covers que usara al crear
      // el reporte, asi que lo que se muestra aqui no puede discrepar de la
      // asignacion real.
      const distrito = await distritoPorCoordenadas(coordenadas.latitud, coordenadas.longitud);
      onCambiar({ coordenadas, manual, distrito });
    } catch {
      // Un fallo de red al resolver el distrito no debe impedir reportar:
      // el backend lo asignara igual al recibir el POST.
      onCambiar({ coordenadas, manual, distrito: null });
    } finally {
      setResolviendo(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Ubicación</span>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void usarGps()}
          disabled={geo.estado === 'localizando'}
          className="rounded-md bg-sky-600 px-3 py-1.5 text-sm font-medium text-white
                     transition hover:bg-sky-700 disabled:opacity-60"
        >
          {geo.estado === 'localizando' ? 'Buscando tu ubicación…' : 'Usar mi ubicación (GPS)'}
        </button>
        <button
          type="button"
          onClick={() => setMostrarMapa((v) => !v)}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm
                     dark:border-slate-600 dark:text-slate-200"
        >
          {mostrarMapa ? 'Ocultar mapa' : 'Marcar en el mapa'}
        </button>
      </div>

      {geo.estado === 'fallida' && (
        <p role="status" className="text-sm text-amber-700 dark:text-amber-400">
          {geo.motivo}
        </p>
      )}

      {mostrarMapa && (
        <div className="flex flex-col gap-1">
          <MapaSelectorUbicacion
            valor={valor?.coordenadas ?? null}
            onSeleccionar={(c) => void aplicar(c, true)}
          />
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Toca el mapa para marcar dónde está el daño.
          </p>
        </div>
      )}

      {valor && (
        <div className="rounded-md border border-slate-200 bg-white p-3 text-sm dark:border-slate-700 dark:bg-slate-800">
          <p className="text-slate-700 dark:text-slate-200">
            {valor.coordenadas.latitud.toFixed(5)}, {valor.coordenadas.longitud.toFixed(5)}
            {valor.manual ? ' · marcada en el mapa' : ' · obtenida por GPS'}
            {geo.estado === 'obtenida' && !valor.manual && ` · ±${geo.precisionMetros} m`}
          </p>

          {resolviendo ? (
            <p className="mt-1 text-slate-500">Verificando distrito…</p>
          ) : valor.distrito ? (
            // Hace visible la restriccion clave del proyecto: la asignacion es
            // automatica y el ciudadano no elige municipalidad.
            <p className="mt-1 text-slate-600 dark:text-slate-300">
              Se enviará a la{' '}
              <strong className="text-slate-900 dark:text-slate-100">
                Municipalidad de {valor.distrito.nombre}
              </strong>
            </p>
          ) : (
            <p role="alert" className="mt-1 text-red-600 dark:text-red-400">
              Esta ubicación está fuera de Lima Metropolitana. Elige un punto dentro de la
              cobertura.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

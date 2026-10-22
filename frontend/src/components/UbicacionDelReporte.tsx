'use client';

import dynamic from 'next/dynamic';
import {
  enlaceOpenStreetMap,
  textoDeCoordenadas,
  ubicacionValida,
} from '@/lib/types/ubicacion';

/**
 * Leaflet toca el DOM al construirse: el mini mapa no puede renderizarse en
 * el servidor.
 */
const MiniMapaUbicacion = dynamic(() => import('@/map/MiniMapaUbicacion'), {
  ssr: false,
  loading: () => <div className="h-48 w-full animate-pulse bg-slate-200 dark:bg-slate-700" />,
});

interface Props {
  latitud: number | null | undefined;
  longitud: number | null | undefined;
  /** Titulo visible del reporte: nombra el marcador del mapa. */
  titulo: string;
}

/**
 * QA-1 I-1: donde esta el daño, en los tres detalles de reporte (publico, del
 * ciudadano y de la bandeja municipal). Es lo que el funcionario necesita
 * para despachar a la cuadrilla.
 *
 * Tres formas del mismo dato, porque cada una sirve a alguien distinto: el
 * mini mapa (orientarse de un vistazo), las coordenadas en texto (copiarlas,
 * leerlas con un lector de pantalla, que no ve el mapa) y el enlace a
 * OpenStreetMap (verlo en grande o pedir la ruta). Es compartido porque lo
 * usan `reportes` y `gestion`.
 */
export function UbicacionDelReporte({ latitud, longitud, titulo }: Props) {
  const ubicacion = ubicacionValida(latitud, longitud);

  return (
    <section
      aria-labelledby="ubicacion-del-reporte"
      className="flex flex-col gap-2 rounded-md border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800"
    >
      <h2 id="ubicacion-del-reporte" className="text-sm font-semibold text-slate-900 dark:text-slate-100">
        Ubicación
      </h2>
      {ubicacion ? (
        <>
          {/* `isolate` encierra los z-index de Leaflet (hasta 1000) dentro del
              recuadro, para que no tapen nada de la pagina. La `key` vuelve a
              montar el mapa si cambia el punto: Leaflet solo lee el centro al
              crearse. */}
          <div className="isolate overflow-hidden rounded-md border border-slate-200 dark:border-slate-700">
            <MiniMapaUbicacion
              key={`${ubicacion.latitud},${ubicacion.longitud}`}
              latitud={ubicacion.latitud}
              longitud={ubicacion.longitud}
              etiqueta={`Ubicación del daño: ${titulo}`}
            />
          </div>
          <p className="text-sm text-slate-700 dark:text-slate-300">
            Coordenadas (latitud, longitud):{' '}
            <span className="font-mono tabular-nums">{textoDeCoordenadas(ubicacion)}</span>
          </p>
          <a
            href={enlaceOpenStreetMap(ubicacion)}
            target="_blank"
            rel="noopener noreferrer"
            className="self-start text-sm font-medium text-sky-700 hover:underline dark:text-sky-400"
          >
            Abrir en OpenStreetMap{' '}
            <span className="sr-only">(se abre en otra pestaña)</span>
          </a>
        </>
      ) : (
        <p className="text-sm text-slate-600 dark:text-slate-400">Sin ubicación registrada.</p>
      )}
    </section>
  );
}

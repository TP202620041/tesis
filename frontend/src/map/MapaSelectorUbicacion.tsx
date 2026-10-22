'use client';

import 'leaflet/dist/leaflet.css';
import { DivIcon } from 'leaflet';
import { useMemo } from 'react';
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import { ControlDeZoom } from './ControlDeZoom';

/**
 * Mapa para marcar una ubicacion (US-05, escenario 2: GPS no disponible).
 *
 * Encapsula Leaflet por completo (requisito de 03_scaffolding): el resto de
 * la aplicacion trabaja con `{ latitud, longitud }` y no importa nada de
 * Leaflet. Cambiar de proveedor de mapas tocaria solo este directorio.
 *
 * Es un componente de cliente y debe cargarse con `ssr: false`: Leaflet
 * manipula el DOM al construirse y falla si se renderiza en el servidor.
 *
 * Se reutilizara en el mapa interactivo de US-10, en modo lectura.
 */

export interface Coordenadas {
  latitud: number;
  longitud: number;
}

/** Centro por defecto: Plaza Mayor de Lima, si aun no hay ubicacion. */
const CENTRO_LIMA: Coordenadas = { latitud: -12.0464, longitud: -77.033 };

const ZOOM_CALLE = 17;

/**
 * Marcador dibujado con HTML/CSS en vez de la imagen por defecto de Leaflet.
 *
 * Dos motivos: los iconos por defecto se cargan desde una URL que los
 * bundlers rompen (problema conocido de Leaflet con webpack/Turbopack), y
 * ademas asi no hace falta permitir origenes extra de imagenes en la CSP.
 */
function crearIcono(): DivIcon {
  return new DivIcon({
    className: '',
    html: `<span style="
      display:block; width:1.5rem; height:1.5rem;
      border-radius:9999px 9999px 9999px 2px;
      transform: rotate(-45deg);
      background:var(--cv-texto); border:3px solid var(--cv-superficie);
      box-shadow:0 2px 6px rgba(0,0,0,.4);"></span>`,
    iconSize: [24, 24],
    iconAnchor: [12, 24],
  });
}

/** Traduce clics del mapa a coordenadas para el formulario. */
function CapturarClic({ onSeleccionar }: { onSeleccionar: (c: Coordenadas) => void }) {
  useMapEvents({
    click(evento) {
      onSeleccionar({ latitud: evento.latlng.lat, longitud: evento.latlng.lng });
    },
  });
  return null;
}

/**
 * Recentra el mapa cuando la ubicacion cambia desde fuera (por ejemplo
 * cuando llega la lectura del GPS despues de montar el mapa).
 */
function Recentrar({ centro }: { centro: Coordenadas }) {
  const mapa = useMap();
  mapa.setView([centro.latitud, centro.longitud], mapa.getZoom());
  return null;
}

interface Props {
  /** Punto seleccionado, o `null` si aun no hay ninguno. */
  valor: Coordenadas | null;
  onSeleccionar: (coordenadas: Coordenadas) => void;
  /** Alto CSS del contenedor. El mapa necesita una altura explicita. */
  alto?: string;
}

export default function MapaSelectorUbicacion({ valor, onSeleccionar, alto = '20rem' }: Props) {
  const icono = useMemo(() => crearIcono(), []);
  const centro = valor ?? CENTRO_LIMA;

  return (
    <MapContainer
      center={[centro.latitud, centro.longitud]}
      zoom={valor ? ZOOM_CALLE : 12}
      style={{ height: alto, width: '100%', borderRadius: '0.5rem' }}
      // El teclado de Leaflet ayuda a la accesibilidad (US-23).
      keyboard
      zoomControl={false}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        crossOrigin="anonymous"
        maxZoom={19}
      />
      <ControlDeZoom />
      <CapturarClic onSeleccionar={onSeleccionar} />
      {valor && (
        <>
          <Recentrar centro={valor} />
          <Marker position={[valor.latitud, valor.longitud]} icon={icono} />
        </>
      )}
    </MapContainer>
  );
}

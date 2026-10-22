'use client';

import 'leaflet/dist/leaflet.css';
import { DivIcon } from 'leaflet';
import { useMemo } from 'react';
import { MapContainer, Marker, TileLayer } from 'react-leaflet';
import type { Ubicacion } from '@/lib/types/ubicacion';

/**
 * QA-1 I-1: mini mapa de SOLO LECTURA con el punto de un reporte, para los
 * detalles (publico, del ciudadano y de la bandeja municipal).
 *
 * Tercer hermano de `MapaReportes` (muchos puntos) y `MapaSelectorUbicacion`
 * (elegir uno): aqui no se elige ni se explora, solo se muestra donde esta el
 * daño. Por eso se apagan los gestos que estorban en una pagina que se
 * desplaza con el dedo:
 *
 * - sin arrastre ni zoom tactil: en el movil, al desplazar la pagina con el
 *   dedo sobre el mapa no se mueve el mapa por accidente (y el punto no se
 *   pierde de vista);
 * - sin zoom con la rueda ni con doble clic: la rueda sigue desplazando la
 *   pagina;
 * - sin teclado de Leaflet: el contenedor no es una parada de tabulacion
 *   (no hay nada que hacer con el); los botones +/- si lo son, y como el
 *   mapa no se puede arrastrar, acercan y alejan siempre sobre el punto.
 *
 * El marcador no es interactivo (no abre nada): es una imagen con nombre
 * accesible. Se construye como elemento del DOM, no con `html` en texto,
 * porque el nombre lleva el titulo que escribio el ciudadano y armarlo como
 * HTML seria inyectar texto ajeno en el documento; `setAttribute` lo escapa.
 *
 * Mismo host de tiles que los otros dos mapas: la CSP no cambia.
 */

const ZOOM_CALLE = 17;

function crearIcono(etiqueta: string): DivIcon {
  const marca = document.createElement('span');
  marca.setAttribute('role', 'img');
  marca.setAttribute('aria-label', etiqueta);
  marca.style.cssText = [
    'display:block',
    'width:1.75rem',
    'height:1.75rem',
    'border-radius:9999px 9999px 9999px 2px',
    'transform:rotate(-45deg)',
    'background:#dc2626',
    'border:3px solid #fff',
    'box-shadow:0 2px 6px rgba(0,0,0,.45)',
  ].join(';');
  return new DivIcon({
    className: '',
    html: marca,
    iconSize: [28, 28],
    // La punta de la gota (esquina inferior izquierda antes de rotar) queda
    // abajo al centro: ahi esta el punto exacto.
    iconAnchor: [14, 28],
  });
}

interface Props extends Ubicacion {
  /** Nombre accesible del marcador, p. ej. «Ubicación del daño: Bache en Av. Larco». */
  etiqueta: string;
  /** Alto CSS del contenedor. El mapa necesita una altura explicita. */
  alto?: string;
}

export default function MiniMapaUbicacion({ latitud, longitud, etiqueta, alto = '12rem' }: Props) {
  const icono = useMemo(() => crearIcono(etiqueta), [etiqueta]);

  return (
    <MapContainer
      center={[latitud, longitud]}
      zoom={ZOOM_CALLE}
      style={{ height: alto, width: '100%' }}
      dragging={false}
      touchZoom={false}
      scrollWheelZoom={false}
      doubleClickZoom={false}
      boxZoom={false}
      keyboard={false}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        crossOrigin="anonymous"
        maxZoom={19}
      />
      <Marker position={[latitud, longitud]} icon={icono} interactive={false} keyboard={false} />
    </MapContainer>
  );
}

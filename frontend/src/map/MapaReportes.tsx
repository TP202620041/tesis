'use client';

import 'leaflet/dist/leaflet.css';
import { DivIcon, type LatLngBounds } from 'leaflet';
import { useEffect, useMemo } from 'react';
import {
  CircleMarker,
  MapContainer,
  Marker,
  Popup,
  TileLayer,
  Tooltip,
  useMapEvents,
} from 'react-leaflet';
import type { BoundingBox } from '@/features/reportes/model/bbox';
import { estiloDeNivel, textoDeRango, type CeldaCalor } from '@/features/reportes/model/densidad';
import { ESTADOS_EN_MAPA, estiloDeEstado } from '@/lib/types/estados';
import type { ReporteResumen } from '@/features/reportes/model/tipos';
import { urlDeFoto } from '@/lib/api/client';

/**
 * Mapa de reportes en modo LECTURA (US-10).
 *
 * Hermano de `MapaSelectorUbicacion` (US-05): comparten la eleccion de
 * Leaflet y el patron de encapsularlo, pero resuelven cosas distintas —
 * alli se elige un punto, aqui se muestran muchos. Se mantienen separados en
 * vez de un componente con modos porque casi nada de su interior coincide
 * (uno maneja seleccion, el otro marcadores y popups) y fusionarlos daria un
 * componente con dos comportamientos entrelazados.
 *
 * Sigue siendo el resto de la app quien no sabe de Leaflet: hacia afuera
 * expone {@link BoundingBox} y `ReporteResumen`.
 */

/** Centro por defecto: Lima Metropolitana. */
const CENTRO_LIMA: [number, number] = [-12.06, -77.04];
const ZOOM_INICIAL = 13;

function iconoDeEstado(color: string): DivIcon {
  return new DivIcon({
    className: '',
    html: `<span style="
      display:block; width:1.1rem; height:1.1rem; border-radius:9999px;
      background:${color}; border:2.5px solid #fff;
      box-shadow:0 1px 4px rgba(0,0,0,.5);"></span>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });
}

function aBoundingBox(bounds: LatLngBounds): BoundingBox {
  return {
    minLat: bounds.getSouth(),
    minLon: bounds.getWest(),
    maxLat: bounds.getNorth(),
    maxLon: bounds.getEast(),
  };
}

/**
 * Avisa del area visible.
 *
 * Escucha `moveend`/`zoomend`, no `move`/`zoom`: Leaflet emite los segundos
 * en cada cuadro de la animacion, lo que dispararia decenas de consultas por
 * gesto. El debounce vive en el componente padre.
 */
function ObservarArea({ onAreaCambiada }: { onAreaCambiada: (b: BoundingBox) => void }) {
  const mapa = useMapEvents({
    moveend: () => onAreaCambiada(aBoundingBox(mapa.getBounds())),
    zoomend: () => onAreaCambiada(aBoundingBox(mapa.getBounds())),
  });

  // Area inicial al montar: sin esto no se cargaria nada hasta que el
  // usuario moviera el mapa. No se usa el evento `load` porque no dispara
  // cuando el contenedor ya estaba inicializado.
  useEffect(() => {
    onAreaCambiada(aBoundingBox(mapa.getBounds()));
    // Solo al montar; `onAreaCambiada` viene memoizada del padre.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}

/**
 * US-11: capa de calor. Cada celda de la grilla del backend se dibuja como un
 * `CircleMarker` centrado en el nodo, sin plugins (p. ej. `leaflet.heat`):
 *
 * - Radio en PIXELES, no en metros: la celda mide ~110 m, que a la escala de
 *   la ciudad (zoom 11-12) serian uno o dos pixeles. Con radio fijo por nivel
 *   la capa se lee a cualquier zoom, y las celdas vecinas se funden en
 *   manchas como en un mapa de calor.
 * - Color y TAMANO crecen con el nivel (`model/densidad.ts`), asi que la
 *   intensidad no depende solo del color, y la leyenda repite ambos.
 * - Vectores en el `overlayPane`, por debajo de los marcadores
 *   (`markerPane`): los marcadores siguen siendo clicables encima.
 */
function CapaCalor({ celdas }: { celdas: CeldaCalor[] }) {
  return celdas.map((celda) => {
    const estilo = estiloDeNivel(celda.nivel);
    return (
      <CircleMarker
        key={`${celda.latitud},${celda.longitud}`}
        center={[celda.latitud, celda.longitud]}
        radius={estilo.radio}
        pathOptions={{
          color: estilo.color,
          weight: 1,
          opacity: 0.7,
          fillColor: estilo.color,
          fillOpacity: 0.55,
        }}
      >
        <Tooltip>
          {textoDeRango(celda.cantidad, celda.cantidad)} · densidad {estilo.etiqueta.toLowerCase()}
        </Tooltip>
      </CircleMarker>
    );
  });
}

interface Props {
  reportes: ReporteResumen[];
  onAreaCambiada: (bbox: BoundingBox) => void;
  onSeleccionar?: (reporte: ReporteResumen) => void;
  alto?: string;
  /** `false` oculta los marcadores (la busqueda sigue: la usa la lista). */
  mostrarMarcadores?: boolean;
  /** Celdas de la capa de calor (US-11); vacia o ausente = capa apagada. */
  celdasCalor?: CeldaCalor[];
}

export default function MapaReportes({
  reportes,
  onAreaCambiada,
  onSeleccionar,
  alto = '100%',
  mostrarMarcadores = true,
  celdasCalor = [],
}: Props) {
  // Un icono por color, no por marcador: con cientos de reportes, crear un
  // DivIcon por cada uno seria trabajo repetido para las pocas variantes
  // posibles. Se construyen todos de una vez dentro del memo (los colores
  // son un conjunto conocido y cerrado) en vez de ir poblando el mapa sobre
  // la marcha, que ademas seria mutar un valor memoizado.
  const iconos = useMemo(() => {
    const porColor = new Map<string, DivIcon>();
    for (const estado of ESTADOS_EN_MAPA) {
      const { color } = estiloDeEstado(estado);
      porColor.set(color, iconoDeEstado(color));
    }
    return porColor;
  }, []);

  const iconoDesconocido = useMemo(() => iconoDeEstado(estiloDeEstado('').color), []);

  return (
    <MapContainer
      center={CENTRO_LIMA}
      zoom={ZOOM_INICIAL}
      style={{ height: alto, width: '100%' }}
      keyboard
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        maxZoom={19}
      />
      <ObservarArea onAreaCambiada={onAreaCambiada} />

      <CapaCalor celdas={celdasCalor} />

      {mostrarMarcadores && reportes.map((reporte) => {
        const estilo = estiloDeEstado(reporte.estado ?? '');
        return (
          <Marker
            key={reporte.id}
            position={[reporte.latitud ?? 0, reporte.longitud ?? 0]}
            icon={iconos.get(estilo.color) ?? iconoDesconocido}
            eventHandlers={
              onSeleccionar ? { click: () => onSeleccionar(reporte) } : undefined
            }
          >
            <Popup>
              <PopupReporte reporte={reporte} />
            </Popup>
          </Marker>
        );
      })}
    </MapContainer>
  );
}

/**
 * Resumen dentro del popup.
 *
 * Usa solo lo que ya trae `ReporteResumenResponse` — no hace una llamada por
 * reporte: el endpoint de busqueda ya devuelve foto, categoria, fecha,
 * estado y distrito, que es exactamente lo que pide el escenario.
 */
function PopupReporte({ reporte }: { reporte: ReporteResumen }) {
  const estilo = estiloDeEstado(reporte.estado ?? '');
  const foto = urlDeFoto(reporte.fotoUrl);
  const fecha = reporte.createdAt
    ? new Date(reporte.createdAt).toLocaleDateString('es-PE', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : null;

  return (
    <div style={{ minWidth: '13rem' }}>
      {/* La foto de un reporte es publica: sirve directo en <img src>, sin
          token. La de perfil no lo seria (ver urlDeFoto/fotoRequiereAuth). */}
      {foto && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={foto}
          alt={`Foto del daño reportado: ${reporte.categoriaNombre ?? ''}`}
          style={{
            width: '100%',
            maxHeight: '8rem',
            objectFit: 'cover',
            borderRadius: '.25rem',
            marginBottom: '.5rem',
          }}
        />
      )}
      <p style={{ margin: '0 0 .25rem', fontWeight: 600 }}>{reporte.categoriaNombre}</p>
      <p style={{ margin: '0 0 .5rem' }}>
        <span
          style={{
            display: 'inline-block',
            padding: '.1rem .45rem',
            borderRadius: '9999px',
            background: estilo.color,
            color: '#fff',
            fontSize: '.75rem',
          }}
        >
          {estilo.etiqueta}
        </span>
      </p>
      {reporte.descripcion && <p style={{ margin: '0 0 .5rem' }}>{reporte.descripcion}</p>}
      <p style={{ margin: 0, fontSize: '.8rem' }}>
        {reporte.distritoNombre}
        {fecha ? ` · ${fecha}` : ''}
      </p>
      {(reporte.totalAdhesiones ?? 0) > 1 && (
        <p style={{ margin: '.25rem 0 0', fontSize: '.8rem' }}>
          {reporte.totalAdhesiones} vecinos reportaron este daño
        </p>
      )}
      {/* El popup es deliberadamente breve: el detalle completo (y los
          comentarios de US-27) viven en su propia pagina, que ademas se
          puede enlazar y compartir. */}
      <a
        href={`/reportes/${reporte.id}`}
        style={{ display: 'inline-block', marginTop: '.5rem', fontWeight: 600 }}
      >
        Ver detalle
        {reporte.estado === 'RESUELTO' ? ' y comentarios' : ''}
      </a>
    </div>
  );
}

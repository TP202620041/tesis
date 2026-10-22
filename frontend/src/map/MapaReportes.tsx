'use client';

import 'leaflet/dist/leaflet.css';
import { DivIcon, canvas, type LatLngBounds } from 'leaflet';
import { useEffect, useMemo } from 'react';
import {
  CircleMarker,
  MapContainer,
  Marker,
  Popup,
  TileLayer,
  Tooltip,
  useMap,
  useMapEvents,
} from 'react-leaflet';
import { FotoDeReporte } from '@/components/FotoDeReporte';
import type { BoundingBox } from '@/features/reportes/model/bbox';
import { estiloDeNivel, textoDeRango, type CeldaCalor } from '@/features/reportes/model/densidad';
import { nombreDeMarcador } from '@/features/reportes/model/marcador';
import { ESTADOS_EN_MAPA, estiloDeEstado } from '@/lib/types/estados';
import { textoDeSeveridad, tituloVisible } from '@/lib/types/tituloYSeveridad';
import type { ReporteResumen } from '@/features/reportes/model/tipos';

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

/**
 * Lado del area tactil del marcador, en px. QA-1 M-7: el marcador medía 18 px,
 * por debajo del minimo de 24 px para un objetivo tactil (WCAG 2.2, 2.5.8);
 * con 28 px queda holgado. El punto visible sigue chico (20 px) y centrado:
 * el borde transparente agranda donde se puede tocar sin tapar mas mapa.
 */
const LADO_MARCADOR = 28;

function iconoDeEstado(color: string): DivIcon {
  return new DivIcon({
    className: '',
    html: `<span style="
      display:flex; align-items:center; justify-content:center; width:100%; height:100%;">
      <span style="
        display:block; width:1.25rem; height:1.25rem; border-radius:9999px;
        background:${color}; border:2.5px solid #fff;
        box-shadow:0 1px 4px rgba(0,0,0,.5);"></span>
    </span>`,
    iconSize: [LADO_MARCADOR, LADO_MARCADOR],
    iconAnchor: [LADO_MARCADOR / 2, LADO_MARCADOR / 2],
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
 * Avisa a Leaflet cuando cambia el tamaño de su contenedor sin que cambie la
 * ventana. QA-1 I-4: en el movil, plegar o desplegar el panel de filtros
 * cambia el alto del mapa; Leaflet solo escucha el `resize` de la ventana, y
 * sin `invalidateSize` el area nueva quedaria gris hasta el siguiente gesto.
 * `invalidateSize` emite `moveend`, asi que el area visible que informa
 * `ObservarArea` tambien se actualiza (con el debounce y el umbral de siempre).
 */
function AjustarAlContenedor() {
  const mapa = useMap();
  useEffect(() => {
    if (typeof ResizeObserver === 'undefined') return;
    const observador = new ResizeObserver(() => mapa.invalidateSize());
    observador.observe(mapa.getContainer());
    return () => observador.disconnect();
  }, [mapa]);
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
 * - **Un solo `<canvas>` compartido** para todas las celdas, no un nodo SVG
 *   por celda: la capa no tiene tope (la grilla cubre toda Lima con los
 *   filtros dados), y con miles de celdas el SVG por defecto de Leaflet
 *   crearia miles de nodos en el DOM. El renderer se crea una vez por
 *   montaje de la capa.
 */
function CapaCalor({ celdas }: { celdas: CeldaCalor[] }) {
  const renderer = useMemo(() => canvas(), []);
  return celdas.map((celda) => {
    const estilo = estiloDeNivel(celda.nivel);
    return (
      <CircleMarker
        key={`${celda.latitud},${celda.longitud}`}
        center={[celda.latitud, celda.longitud]}
        radius={estilo.radio}
        renderer={renderer}
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
  /** Enlace «Ver detalle» del popup (QA-1 M-9: lleva `?volver=` a la vista actual). */
  hrefDelDetalle?: (reporteId: number) => string;
}

export default function MapaReportes({
  reportes,
  onAreaCambiada,
  onSeleccionar,
  alto = '100%',
  mostrarMarcadores = true,
  celdasCalor = [],
  hrefDelDetalle = (reporteId) => `/reportes/${reporteId}`,
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
        crossOrigin="anonymous"
        maxZoom={19}
      />
      <ObservarArea onAreaCambiada={onAreaCambiada} />
      <AjustarAlContenedor />

      <CapaCalor celdas={celdasCalor} />

      {mostrarMarcadores && reportes.map((reporte) => {
        const estilo = estiloDeEstado(reporte.estado ?? '');
        const nombre = nombreDeMarcador(reporte);
        return (
          <Marker
            // QA-1 M-7: Leaflet hace del marcador un `div role="button"`
            // (para abrir el popup con el teclado) cuyo unico nombre posible
            // es su `title`. Leaflet solo lo lee al crear el marcador, asi
            // que el nombre va en la `key`: si cambian el estado o el titulo
            // del reporte, el marcador se vuelve a crear con el nombre nuevo.
            key={`${reporte.id}:${nombre}`}
            title={nombre}
            position={[reporte.latitud ?? 0, reporte.longitud ?? 0]}
            icon={iconos.get(estilo.color) ?? iconoDesconocido}
            eventHandlers={
              onSeleccionar ? { click: () => onSeleccionar(reporte) } : undefined
            }
          >
            <Popup>
              <PopupReporte reporte={reporte} href={hrefDelDetalle(reporte.id ?? 0)} />
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
 * reporte: el endpoint de busqueda ya devuelve foto, titulo, categoria,
 * severidad (NC-02), fecha, estado y distrito.
 */
function PopupReporte({ reporte, href }: { reporte: ReporteResumen; href: string }) {
  const estilo = estiloDeEstado(reporte.estado ?? '');
  // Ya absoluta: la compone `reportes/api.ts` (`buscarReportes`).
  const foto = reporte.fotoUrl;
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
          token. La de perfil no lo seria (ver auth/api: descargarFotoDePerfil). */}
      {foto && (
        <FotoDeReporte
          src={foto}
          alt={`Foto del daño reportado: ${tituloVisible(reporte.titulo)}`}
          className="mb-2 max-h-32 w-full rounded object-cover"
          claseDelReemplazo="h-16"
        />
      )}
      <p style={{ margin: '0 0 .25rem', fontWeight: 600 }}>{tituloVisible(reporte.titulo)}</p>
      <p style={{ margin: '0 0 .25rem', fontSize: '.8rem' }}>
        {[reporte.categoriaNombre, textoDeSeveridad(reporte.severidad)].filter(Boolean).join(' · ')}
      </p>
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
        href={href}
        style={{ display: 'inline-block', marginTop: '.5rem', fontWeight: 600 }}
      >
        Ver detalle
        {reporte.estado === 'RESUELTO' ? ' y comentarios' : ''}
      </a>
    </div>
  );
}

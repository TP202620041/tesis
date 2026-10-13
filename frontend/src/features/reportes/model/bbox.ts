/**
 * Area rectangular visible del mapa (US-10).
 *
 * Se define aqui, sin depender de Leaflet, para que la logica que decide
 * cuando volver a consultar el backend sea pura y testeable: quien usa el
 * mapa traduce sus `LatLngBounds` a esta forma y el resto del codigo ya no
 * sabe de Leaflet.
 */
export interface BoundingBox {
  minLat: number;
  minLon: number;
  maxLat: number;
  maxLon: number;
}

/**
 * Cuanto debe moverse el mapa para justificar una consulta nueva, en grados.
 *
 * ~0.0005 grados son unos 55 m en Lima. Por debajo de eso el usuario apenas
 * ajusto el encuadre y los reportes visibles son practicamente los mismos:
 * volver a pedirlos solo gasta una peticion. Es un complemento del debounce,
 * no un sustituto — el debounce agrupa movimientos en el tiempo, este umbral
 * descarta los que ademas son irrelevantes en el espacio.
 */
const UMBRAL_GRADOS = 0.0005;

/** `true` si el area es utilizable (el backend exige las 4 coordenadas). */
export function esBboxValido(bbox: BoundingBox | null): bbox is BoundingBox {
  if (!bbox) return false;
  const valores = [bbox.minLat, bbox.minLon, bbox.maxLat, bbox.maxLon];
  if (valores.some((v) => !Number.isFinite(v))) return false;
  // Un area degenerada (alto o ancho cero) no contiene nada.
  return bbox.minLat < bbox.maxLat && bbox.minLon < bbox.maxLon;
}

/**
 * `true` si el area cambio lo suficiente como para volver a consultar.
 *
 * Sin area previa siempre hay que consultar (primera carga).
 */
export function requiereNuevaConsulta(
  anterior: BoundingBox | null,
  actual: BoundingBox,
  umbral: number = UMBRAL_GRADOS,
): boolean {
  if (!anterior) return true;
  return (
    Math.abs(anterior.minLat - actual.minLat) > umbral ||
    Math.abs(anterior.minLon - actual.minLon) > umbral ||
    Math.abs(anterior.maxLat - actual.maxLat) > umbral ||
    Math.abs(anterior.maxLon - actual.maxLon) > umbral
  );
}

/** Filtros del panel lateral (US-10, escenario 2). */
export interface FiltrosMapa {
  distritoId: number | null;
  categoriaId: number | null;
  estado: string | null;
}

export const FILTROS_VACIOS: FiltrosMapa = {
  distritoId: null,
  categoriaId: null,
  estado: null,
};

/**
 * Query string para `GET /api/reportes`.
 *
 * Los filtros nulos se omiten en vez de enviarse vacios: el backend
 * interpreta "parametro ausente" como "no filtrar", y mandar `estado=`
 * lo haria fallar al convertirlo al enum.
 */
export function construirQuery(
  bbox: BoundingBox,
  filtros: FiltrosMapa,
  size: number,
): string {
  const params = new URLSearchParams({
    minLat: String(bbox.minLat),
    minLon: String(bbox.minLon),
    maxLat: String(bbox.maxLat),
    maxLon: String(bbox.maxLon),
    size: String(size),
  });
  if (filtros.distritoId != null) params.set('distritoId', String(filtros.distritoId));
  if (filtros.categoriaId != null) params.set('categoriaId', String(filtros.categoriaId));
  if (filtros.estado) params.set('estado', filtros.estado);
  return params.toString();
}

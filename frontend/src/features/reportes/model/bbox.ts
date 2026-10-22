import {
  esDiaValido,
  finDelDiaLocal,
  inicioDelDiaLocal,
  rangoDeDiasInvertido,
} from '@/lib/types/fechas';

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

/**
 * Cuantos reportes pedir por area visible.
 *
 * El endpoint pagina con 20 por defecto, que en un mapa dejaria zonas
 * densas a medio dibujar. Se sube el tamano en vez de paginar porque un
 * mapa no tiene "siguiente pagina": o el marcador esta o no esta. El
 * `totalElements` de la respuesta permite avisar si el area supera el
 * limite. La vista de lista (US-12) pagina en el cliente sobre estos MISMOS
 * resultados, para que lista y mapa muestren siempre lo mismo.
 */
export const MAXIMO_MARCADORES = 300;

/** Filtros del panel lateral (US-10, escenario 2; fechas de US-12). */
export interface FiltrosMapa {
  distritoId: number | null;
  categoriaId: number | null;
  estado: string | null;
  /** Dia local `AAAA-MM-DD`, como lo da `<input type="date">`. */
  fechaDesde: string | null;
  /** Dia local `AAAA-MM-DD`; incluye el dia completo. */
  fechaHasta: string | null;
}

/** Filtros sin aplicar: unica fuente para el estado inicial, `hayFiltrosActivos` y «Limpiar». */
export const FILTROS_VACIOS: FiltrosMapa = {
  distritoId: null,
  categoriaId: null,
  estado: null,
  fechaDesde: null,
  fechaHasta: null,
};

/** `true` si algun filtro difiere de {@link FILTROS_VACIOS}. */
export function hayFiltrosActivos(filtros: FiltrosMapa): boolean {
  return cantidadDeFiltrosActivos(filtros) > 0;
}

/**
 * Cuantos filtros difieren de {@link FILTROS_VACIOS} (cada fecha cuenta
 * aparte). QA-1 I-4: en el movil el panel se pliega, y el boton que lo abre
 * dice cuantos hay aplicados para que no filtren sin que se vea.
 */
export function cantidadDeFiltrosActivos(filtros: FiltrosMapa): number {
  return (Object.keys(FILTROS_VACIOS) as (keyof FiltrosMapa)[]).filter(
    (clave) => filtros[clave] !== FILTROS_VACIOS[clave],
  ).length;
}

export const MENSAJE_RANGO_INVERTIDO =
  'La fecha «desde» no puede ser posterior a la fecha «hasta».';

/**
 * Valida los filtros antes de consultar. Devuelve el mensaje a mostrar, o
 * `null` si se puede consultar. Con un rango invertido no se consulta: el
 * resultado seria vacio y parecería que no hay reportes, cuando en realidad
 * el filtro es imposible (el backend ademas lo rechaza con 400).
 */
export function validarFiltrosMapa(filtros: FiltrosMapa): string | null {
  return rangoDeDiasInvertido(filtros.fechaDesde, filtros.fechaHasta)
    ? MENSAJE_RANGO_INVERTIDO
    : null;
}

/**
 * Query string para `GET /api/reportes`.
 *
 * Los filtros nulos se omiten en vez de enviarse vacios: el backend
 * interpreta "parametro ausente" como "no filtrar", y mandar `estado=`
 * lo haria fallar al convertirlo al enum. Las fechas viajan como instantes
 * ISO con semantica de dia local (`lib/types/fechas`, igual que la bandeja).
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
  agregarFiltros(params, filtros);
  return params.toString();
}

/**
 * Agrega a `params` los filtros del panel, omitiendo los nulos.
 *
 * Unica traduccion de {@link FiltrosMapa} a parametros: la comparten la
 * busqueda (`construirQuery`) y la densidad del mapa de calor (US-11,
 * `densidad.ts`), para que las dos capas del mapa no puedan filtrar distinto.
 */
export function agregarFiltros(params: URLSearchParams, filtros: FiltrosMapa): void {
  if (filtros.distritoId != null) params.set('distritoId', String(filtros.distritoId));
  if (filtros.categoriaId != null) params.set('categoriaId', String(filtros.categoriaId));
  if (filtros.estado) params.set('estado', filtros.estado);
  if (esDiaValido(filtros.fechaDesde)) params.set('fechaDesde', inicioDelDiaLocal(filtros.fechaDesde));
  if (esDiaValido(filtros.fechaHasta)) params.set('fechaHasta', finDelDiaLocal(filtros.fechaHasta));
}

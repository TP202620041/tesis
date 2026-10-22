/**
 * QA-1 I-1: como se muestra DONDE esta un daño. Vive en `lib/types` porque lo
 * usan los detalles de `reportes` (publico y del ciudadano) y de `gestion`
 * (bandeja municipal), igual que `estados.ts`.
 *
 * El backend ya devuelve `latitud` y `longitud` en los tres DTO; el spec las
 * marca opcionales (records sin nulabilidad), asi que se validan aqui en vez
 * de dibujar un mapa en (0, 0) o un enlace roto.
 */

export interface Ubicacion {
  latitud: number;
  longitud: number;
}

/**
 * La ubicacion si ambas coordenadas son numeros en rango; `null` si falta
 * alguna o no tiene sentido. La UI muestra «Sin ubicación registrada» en vez
 * de un punto inventado.
 */
export function ubicacionValida(
  latitud: number | null | undefined,
  longitud: number | null | undefined,
): Ubicacion | null {
  if (latitud == null || longitud == null) return null;
  if (!Number.isFinite(latitud) || !Number.isFinite(longitud)) return null;
  if (Math.abs(latitud) > 90 || Math.abs(longitud) > 180) return null;
  return { latitud, longitud };
}

/**
 * Decimales con que se muestran las coordenadas: 5 son ~1 m, mas fino que el
 * GPS de un telefono y suficiente para que la cuadrilla llegue al punto. Mas
 * decimales serian ruido (no hay esa precision en el dato).
 */
const DECIMALES_TEXTO = 5;

/**
 * «-12.11800, -77.03200» (latitud, longitud). Es el formato que aceptan los
 * buscadores de mapas al pegarlo, y no depende del locale: con `es-PE` el
 * separador decimal tambien es el punto.
 */
export function textoDeCoordenadas({ latitud, longitud }: Ubicacion): string {
  return `${latitud.toFixed(DECIMALES_TEXTO)}, ${longitud.toFixed(DECIMALES_TEXTO)}`;
}

/** Zoom de calle con que se abre OpenStreetMap. */
const ZOOM_ENLACE = 18;

/**
 * Enlace a OpenStreetMap con un marcador en el punto (`mlat`/`mlon`) y el
 * mapa centrado en el (`#map=zoom/lat/lon`).
 *
 * Es navegacion externa (el usuario sale de la app), no un recurso que la
 * pagina cargue: no pasa por la CSP y no hace falta abrir otro origen.
 */
export function enlaceOpenStreetMap({ latitud, longitud }: Ubicacion): string {
  const lat = latitud.toFixed(6);
  const lon = longitud.toFixed(6);
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=${ZOOM_ENLACE}/${lat}/${lon}`;
}

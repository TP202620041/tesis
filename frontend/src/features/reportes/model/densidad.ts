import { agregarFiltros, validarFiltrosMapa, type BoundingBox, type FiltrosMapa } from './bbox';
import type { CeldaDensidad, DensidadReportes } from './tipos';

/**
 * Mapa de calor (US-11): reglas puras de la capa de densidad.
 *
 * El backend devuelve una grilla fija (`celdaGrados`, hoy 0.001° ≈ 110 m)
 * con cuantos reportes caen en cada celda, para TODA Lima y con los mismos
 * filtros que la busqueda. Aqui se decide que pedir, que celdas se ven en el
 * encuadre actual y con que intensidad se dibuja cada una. El dibujo en si
 * (Leaflet) vive en `src/map/`, que solo recibe {@link CeldaCalor}.
 */

/* -------------------------------------------------------------------------
 * Consulta
 * ---------------------------------------------------------------------- */

/**
 * Query string para `GET /api/reportes/densidad`: los filtros del panel y
 * nada mas (sin area ni tamano de pagina). Usa la misma traduccion que la
 * busqueda de marcadores (`agregarFiltros`), asi que las dos capas no
 * pueden filtrar distinto.
 */
export function construirQueryDensidad(filtros: FiltrosMapa): string {
  const params = new URLSearchParams();
  agregarFiltros(params, filtros);
  return params.toString();
}

/**
 * Consulta de densidad que corresponde a estos filtros, o `null` si no se
 * debe consultar (rango de fechas invertido: el backend responderia 400 y
 * el aviso ya lo muestra el panel).
 *
 * **Cuando volver a consultar**: solo cuando esta cadena cambia. A
 * diferencia de los marcadores, la respuesta no depende del area visible,
 * por eso esta funcion ni siquiera la recibe: mover o acercar el mapa no
 * pide nada nuevo, solo recalcula la escala con {@link capaDeCalor}. Y si la
 * cadena se repite, el navegador reutiliza su copia (`Cache-Control:
 * max-age=60` + `ETag` del backend).
 */
export function consultaDeDensidad(filtros: FiltrosMapa): string | null {
  return validarFiltrosMapa(filtros) ? null : construirQueryDensidad(filtros);
}

/* -------------------------------------------------------------------------
 * Escala: cuatro niveles relativos al maximo de la vista
 * ---------------------------------------------------------------------- */

export type NivelCalor = 1 | 2 | 3 | 4;

export interface EstiloNivelCalor {
  nivel: NivelCalor;
  etiqueta: string;
  /**
   * Rampa secuencial de violetas, de claro a oscuro: la luminosidad sola ya
   * ordena los niveles (se lee en escala de grises) y no se confunde con los
   * colores de estado de los marcadores (rojo, naranja, amarillo, verde,
   * gris), que comparten el mapa.
   */
  color: string;
  /** Radio del circulo en pixeles: el tamano repite el nivel, ademas del color. */
  radio: number;
}

const ESTILOS: Record<NivelCalor, EstiloNivelCalor> = {
  1: { nivel: 1, etiqueta: 'Baja', color: '#c4b5fd', radio: 6 },
  2: { nivel: 2, etiqueta: 'Media', color: '#8b5cf6', radio: 8 },
  3: { nivel: 3, etiqueta: 'Alta', color: '#6d28d9', radio: 10 },
  4: { nivel: 4, etiqueta: 'Muy alta', color: '#3b0764', radio: 12 },
};

/** Los niveles de menor a mayor. */
export const NIVELES_CALOR: readonly EstiloNivelCalor[] = [ESTILOS[1], ESTILOS[2], ESTILOS[3], ESTILOS[4]];

const CANTIDAD_NIVELES = NIVELES_CALOR.length;

export function estiloDeNivel(nivel: NivelCalor): EstiloNivelCalor {
  return ESTILOS[nivel];
}

/**
 * Nivel de una celda respecto del maximo de la vista: el cuartil de
 * `cantidad / maximo` en que cae, redondeando hacia arriba. La celda mas
 * cargada siempre es «Muy alta», aunque tenga un solo reporte: la escala es
 * relativa, y la leyenda dice a cuantos reportes equivale cada nivel.
 */
export function nivelDeCalor(cantidad: number, maximo: number): NivelCalor {
  if (maximo <= 0 || cantidad <= 0) return 1;
  const nivel = Math.ceil((cantidad * CANTIDAD_NIVELES) / maximo);
  return Math.min(CANTIDAD_NIVELES, Math.max(1, nivel)) as NivelCalor;
}

/**
 * Cantidades enteras que caen en `nivel` con este maximo (inversa de
 * {@link nivelDeCalor}), o `null` si ninguna cae: con maximos chicos algunos
 * niveles quedan vacios (con maximo 1, solo existe «Muy alta»).
 */
export function rangoDeNivel(
  nivel: NivelCalor,
  maximo: number,
): { desde: number; hasta: number } | null {
  if (maximo <= 0) return null;
  const desde = Math.floor(((nivel - 1) * maximo) / CANTIDAD_NIVELES) + 1;
  const hasta = Math.floor((nivel * maximo) / CANTIDAD_NIVELES);
  return desde <= hasta ? { desde, hasta } : null;
}

/** «1 reporte», «3 reportes», «2 a 4 reportes». */
export function textoDeRango(desde: number, hasta: number): string {
  if (desde === hasta) return `${desde} ${desde === 1 ? 'reporte' : 'reportes'}`;
  return `${desde} a ${hasta} reportes`;
}

/* -------------------------------------------------------------------------
 * Capa lista para dibujar
 * ---------------------------------------------------------------------- */

/** Celda lista para dibujar: su centro, su cantidad y su nivel en la vista. */
export interface CeldaCalor extends CeldaDensidad {
  nivel: NivelCalor;
  /** `cantidad / maximo` de la vista, en (0, 1]. */
  intensidad: number;
}

export interface EntradaLeyendaCalor extends EstiloNivelCalor {
  /** Lo que significa el nivel en reportes, p. ej. «2 a 4 reportes». */
  texto: string;
}

export interface CapaDeCalor {
  /** Celdas visibles, de MENOR a MAYOR cantidad: las mas cargadas se dibujan encima. */
  celdas: CeldaCalor[];
  /** Cantidad de la celda mas cargada de la vista (0 si no hay ninguna). */
  maximo: number;
  /** Reportes sumados en las celdas visibles. */
  totalEnVista: number;
  /** Niveles que tienen al menos una cantidad posible con este maximo. */
  leyenda: EntradaLeyendaCalor[];
}

/**
 * `true` si el centro de la celda cae en el area, ampliada media celda por
 * lado: una celda cortada por el borde del encuadre se sigue viendo.
 */
export function celdaEnArea(celda: CeldaDensidad, area: BoundingBox, celdaGrados: number): boolean {
  const margen = celdaGrados / 2;
  return (
    celda.latitud >= area.minLat - margen &&
    celda.latitud <= area.maxLat + margen &&
    celda.longitud >= area.minLon - margen &&
    celda.longitud <= area.maxLon + margen
  );
}

/**
 * Agrupa la densidad en lo que se dibuja y lo que dice la leyenda.
 *
 * La escala es relativa al maximo **de la vista**, no al de toda Lima: al
 * acercarse a un distrito con pocos reportes se siguen distinguiendo sus
 * zonas, en vez de quedar todo en «Baja» por comparacion con el centro de la
 * ciudad. Sin area (antes de que el mapa la informe) se usa toda la grilla.
 */
export function capaDeCalor(densidad: DensidadReportes, area: BoundingBox | null): CapaDeCalor {
  const visibles = area
    ? densidad.celdas.filter((c) => celdaEnArea(c, area, densidad.celdaGrados))
    : densidad.celdas;

  const maximo = visibles.reduce((max, c) => Math.max(max, c.cantidad), 0);
  const totalEnVista = visibles.reduce((suma, c) => suma + c.cantidad, 0);

  const celdas = visibles
    .map((c) => ({
      ...c,
      nivel: nivelDeCalor(c.cantidad, maximo),
      intensidad: c.cantidad / maximo,
    }))
    .sort((a, b) => a.cantidad - b.cantidad);

  const leyenda: EntradaLeyendaCalor[] = [];
  for (const estilo of NIVELES_CALOR) {
    const rango = rangoDeNivel(estilo.nivel, maximo);
    if (rango) leyenda.push({ ...estilo, texto: textoDeRango(rango.desde, rango.hasta) });
  }

  return { celdas, maximo, totalEnVista, leyenda };
}

/** Lado aproximado de la celda en metros (1° de latitud ≈ 111 km), para la leyenda. */
export function ladoDeCeldaEnMetros(celdaGrados: number): number {
  return Math.round((celdaGrados * 111_320) / 10) * 10;
}

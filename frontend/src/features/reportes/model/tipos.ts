/**
 * Tipos de la feature `reportes` (ARCHITECTURE.md §5.1: `model/` es el unico
 * lugar de la feature, junto con `api.ts`, que conoce los tipos generados).
 *
 * Componentes, hooks, paginas y otras features importan los tipos desde aqui,
 * no desde `api.ts`. La linea de tiempo (`HistorialEntrada`) esta en
 * `lib/types/domain.ts` porque la comparte con `gestion` y con
 * `components/LineaDeTiempo`.
 */
import type { components } from '@/lib/api/generated/schema';

type Schemas = components['schemas'];

/** Respuesta cruda de `POST /api/reportes`; `api.ts` la traduce a {@link ReporteCreado}. */
export type ReporteResponse = Schemas['ReporteResponse'];

/** Resumen de reporte que devuelve la busqueda publica (US-10/US-12). */
export type ReporteResumen = Schemas['ReporteResumenResponse'];

export type ComentarioPublico = Schemas['ComentarioPublicoResponse'];

export type Calificacion = Schemas['CalificacionResponse'];

/**
 * US-11: una celda de la grilla de densidad. Su punto es el CENTRO de la
 * celda (el backend lleva cada reporte al nodo mas cercano con
 * `ST_SnapToGrid`). Los tres campos son NOT NULL en el backend: springdoc los
 * marca opcionales solo porque el record no lleva nulabilidad.
 */
export type CeldaDensidad = Required<Schemas['CeldaDensidadResponse']>;

/**
 * US-11: respuesta de `GET /api/reportes/densidad`. Cubre toda Lima con los
 * filtros dados (no tiene area) y las celdas vienen de mayor a menor
 * `cantidad`. Ningun campo es nulo; `celdas` puede venir vacia.
 */
export type DensidadReportes = Required<Omit<Schemas['DensidadReportesResponse'], 'celdas'>> & {
  celdas: CeldaDensidad[];
};

export interface PaginaReportes {
  contenido: ReporteResumen[];
  /** Total que cumple los filtros, no solo los de esta pagina. */
  total: number;
}

/** Reporte recien creado (o al que el ciudadano se adhirio). */
export interface ReporteCreado {
  id: number;
  /** true = se sumo a un reporte existente cercano (US-09). */
  esAdhesion: boolean;
  totalAdhesiones: number;
  distritoNombre: string | null;
  categoriaNombre: string | null;
  fotoUrl: string | null;
}

export interface NuevoReporte {
  latitud: number;
  longitud: number;
  categoriaId: number;
  descripcion?: string;
  /** true si el ciudadano marco el punto a mano (US-05, escenario 2). */
  ubicacionManual: boolean;
  foto?: File | null;
  /**
   * Clave de idempotencia (US-06): identifica el INTENTO logico de creacion,
   * no la peticion HTTP. Debe ser la MISMA si se reintenta el mismo reporte,
   * para que el backend devuelva la respuesta original en vez de crear un
   * duplicado o rechazarlo con el 409 de acumulacion.
   */
  idempotencyKey: string;
}

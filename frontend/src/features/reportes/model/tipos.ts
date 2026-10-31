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
import type { MotivoDenuncia, Severidad } from '@/lib/types/domain';

type Schemas = components['schemas'];

/** Respuesta cruda de `POST /api/reportes`; `api.ts` la traduce a {@link ReporteCreado}. */
export type ReporteResponse = Schemas['ReporteResponse'];

/**
 * Resumen de reporte que devuelve la busqueda publica (US-10/US-12).
 *
 * NC-02: `severidad` se recupera como la union {@link Severidad} (springdoc
 * la publica como `string`). `titulo` y `severidad` siempre vienen en el
 * resumen (V17 relleno los reportes existentes), pero el tipo los deja
 * opcionales como el resto de los campos del spec, y la UI muestra
 * «Sin título» si faltan (`lib/types/tituloYSeveridad`).
 */
export type ReporteResumen = Omit<Schemas['ReporteResumenResponse'], 'severidad'> & {
  severidad?: Severidad;
};

export type ComentarioPublico = Schemas['ComentarioPublicoResponse'];

export type Calificacion = Schemas['CalificacionResponse'];

/** Respuesta cruda de `POST /api/reportes/{id}/denuncias`; `api.ts` la traduce. */
export type DenunciaRegistradaResponse = Schemas['DenunciaRegistradaResponse'];

/**
 * NC-11b (D-15): lo que el CIUDADANO envia al denunciar un reporte
 * publicado. `detalle` es opcional (hasta 500 caracteres).
 */
export interface NuevaDenuncia {
  motivo: MotivoDenuncia;
  detalle?: string;
}

/**
 * NC-11b: la denuncia que el ciudadano acaba de registrar (201). Solo la ve
 * quien denuncio; «¿ya denuncie?» no viaja en ningun DTO (el 409
 * `DENUNCIA_REPETIDA` lo dice al intentarlo de nuevo).
 */
export interface DenunciaRegistrada {
  id: number;
  reporteId: number;
  motivo: MotivoDenuncia;
  createdAt: string;
}

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

/**
 * Si el catálogo de categorías del formulario ya llegó, sigue cargando (al
 * montar o tras un cambio de distrito) o no se pudo traer.
 */
export type EstadoDelCatalogo = 'cargando' | 'listo' | 'fallido';

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
  /**
   * NC-02: los del reporte que devolvio el backend. En una adhesion (US-09)
   * son los del reporte EXISTENTE, no los que escribio el ciudadano. `null`
   * solo en el reenvio idempotente de un envio procesado antes de NC-02.
   */
  titulo: string | null;
  severidad: Severidad | null;
}

export interface NuevoReporte {
  latitud: number;
  longitud: number;
  categoriaId: number;
  /** NC-02: obligatorio, 5-120 caracteres tras el trim (ver `model/titulo.ts`). */
  titulo: string;
  /** NC-02: obligatoria y sin valor por defecto: la elige el ciudadano. */
  severidad: Severidad;
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

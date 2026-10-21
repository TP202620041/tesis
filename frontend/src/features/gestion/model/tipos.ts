/**
 * Tipos de la feature `gestion` (ARCHITECTURE.md §5.1). Componentes, hooks y
 * paginas los importan desde aqui, no desde `api.ts`. La linea de tiempo
 * (`HistorialEntrada`) es de `lib/types/domain`.
 */
import type { components } from '@/lib/api/generated/schema';
import type { Severidad } from '@/lib/types/domain';

/**
 * US-13/US-14 (SEC-02): reporte tal como lo ve el funcionario en la bandeja.
 *
 * Mismos campos que el `ReporteResumen` publico mas `posibleReincidencia`,
 * la senal interna del detector de reincidencia. Por eso es un tipo aparte:
 * el flag solo viaja en `GET /bandeja` y `PATCH /{id}/estado`, y ninguna vista
 * publica ni del ciudadano debe poder leerlo (regla del proyecto).
 */
export type ReporteGestion = Omit<components['schemas']['ReporteGestionResponse'], 'severidad'> & {
  /**
   * NC-02: declarada por el ciudadano; el funcionario la ve pero no la
   * cambia (no hay endpoint de gestion que la edite). Igual que `titulo`.
   */
  severidad?: Severidad;
};

/** US-15: responsable interno vigente de un reporte. */
export type AsignacionResponsable = components['schemas']['AsignacionResponsableResponse'];

export interface FiltrosBandeja {
  estado: string | null;
  categoriaId: number | null;
  /** Filtro por fecha, aplicado en el cliente (ver `bandeja` en `api.ts`). */
  fechaDesde: string | null;
  fechaHasta: string | null;
}

export const FILTROS_BANDEJA_VACIOS: FiltrosBandeja = {
  estado: null,
  categoriaId: null,
  fechaDesde: null,
  fechaHasta: null,
};

/** Archivo exportado, listo para guardarse con su nombre. */
export interface ReportesExportados {
  contenido: Blob;
  nombreArchivo: string;
}

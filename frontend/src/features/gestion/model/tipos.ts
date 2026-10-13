/**
 * Tipos de la feature `gestion` (ARCHITECTURE.md §5.1). Componentes, hooks y
 * paginas los importan desde aqui, no desde `api.ts`. El reporte en si
 * (`ReporteResumen`) es de `reportes/model/tipos`, y la linea de tiempo
 * (`HistorialEntrada`) de `lib/types/domain`.
 */
import type { components } from '@/lib/api/generated/schema';

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

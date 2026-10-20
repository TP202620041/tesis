/**
 * US-28: reglas de la exportación de la bandeja a CSV/XLSX.
 *
 * Puro: arma los parámetros de `GET /api/reportes/exportar` y decide el
 * nombre del archivo. La descarga en sí la hace el hook.
 */
import { finDelDiaLocal, inicioDelDiaLocal } from '@/lib/types/fechas';

/** Formatos que acepta el backend (`FormatoExportacion`). */
export const FORMATOS_EXPORTACION = ['CSV', 'XLSX'] as const;
export type FormatoExportacion = (typeof FORMATOS_EXPORTACION)[number];

const EXTENSION: Record<FormatoExportacion, string> = { CSV: 'csv', XLSX: 'xlsx' };

/**
 * Filtros activos de la bandeja que se trasladan a la exportación. Misma
 * forma que `FiltrosBandeja` (`gestion/api.ts`); se declara aquí porque el
 * dominio no importa la capa de infraestructura.
 */
export interface FiltrosExportacion {
  estado: string | null;
  categoriaId: number | null;
  /** Día local `AAAA-MM-DD`, como lo da `<input type="date">`. */
  fechaDesde: string | null;
  fechaHasta: string | null;
}

/**
 * Parámetros de la exportación con los MISMOS filtros que muestra la bandeja,
 * para que el archivo contenga exactamente lo que el funcionario está viendo.
 *
 * Las fechas: la bandeja filtra en el cliente por día local, con
 * `fechaHasta` incluyendo el día completo. El backend espera instantes
 * (`Instant`), así que se convierten con la misma semántica: desde las 00:00
 * del primer día hasta las 23:59:59.999 del último, en la zona del navegador
 * (`lib/types/fechas`, la misma conversión que usa el mapa público).
 */
export function parametrosDeExportacion(
  filtros: FiltrosExportacion,
  formato: FormatoExportacion,
): URLSearchParams {
  const params = new URLSearchParams({ formato });
  if (filtros.estado) params.set('estado', filtros.estado);
  if (filtros.categoriaId != null) params.set('categoriaId', String(filtros.categoriaId));
  if (filtros.fechaDesde) params.set('fechaDesde', inicioDelDiaLocal(filtros.fechaDesde));
  if (filtros.fechaHasta) params.set('fechaHasta', finDelDiaLocal(filtros.fechaHasta));
  return params;
}

/**
 * Nombre del archivo a guardar: el que manda el backend en
 * `Content-Disposition` (p. ej. `reportes-miraflores.csv`) o, si no se pudo
 * leer, uno genérico con la extensión del formato.
 *
 * Acepta `filename*=UTF-8''…` (RFC 5987, con prioridad porque admite tildes)
 * y `filename="…"` / `filename=…`.
 */
export function nombreDeArchivo(
  contentDisposition: string | null,
  formato: FormatoExportacion,
): string {
  const porDefecto = `reportes.${EXTENSION[formato]}`;
  if (!contentDisposition) return porDefecto;

  const extendido = /filename\*\s*=\s*([^']*)'[^']*'([^;]+)/i.exec(contentDisposition);
  if (extendido?.[2]) {
    try {
      return limpiar(decodeURIComponent(extendido[2].trim())) || porDefecto;
    } catch {
      // Codificación inválida: se intenta con `filename=`.
    }
  }

  const simple = /filename\s*=\s*(?:"((?:[^"\\]|\\.)*)"|([^;]+))/i.exec(contentDisposition);
  const valor = simple?.[1]?.replace(/\\(.)/g, '$1') ?? simple?.[2]?.trim();
  return (valor && limpiar(valor)) || porDefecto;
}

/** Sin rutas: el nombre no debe poder apuntar a otra carpeta. */
function limpiar(nombre: string): string {
  return nombre.replace(/[/\\]/g, '_').trim();
}

import { api, apiDescargar } from '@/lib/api/client';
import { ApiError } from '@/lib/api/errors';
import type { HistorialEntrada } from '@/lib/types/domain';
import {
  nombreDeArchivo,
  parametrosDeExportacion,
  type FiltrosExportacion,
  type FormatoExportacion,
} from './model/exportacion';
import type {
  AsignacionResponsable,
  FiltrosBandeja,
  ReporteGestion,
  ReportesExportados,
} from './model/tipos';

/**
 * API de gestion municipal (US-13, US-14, US-15, US-22, US-28).
 *
 * Todas exigen token y rol FUNCIONARIO_MUNICIPAL, y el backend valida ademas
 * que el reporte pertenezca al distrito del funcionario (403 si no). Por eso
 * NINGUNA lleva `conAuth: false`.
 */

/**
 * US-13: reportes del distrito del funcionario.
 *
 * `estado` y `categoriaId` los filtra el backend; el RANGO DE FECHAS no —
 * ese endpoint no acepta esos parametros (a diferencia del de exportacion de
 * US-28). Se filtra en el cliente, lo cual es correcto y no parcial porque
 * la bandeja devuelve la LISTA COMPLETA del distrito, no una pagina: no hay
 * riesgo de filtrar solo sobre un subconjunto.
 */
export async function bandeja(filtros: FiltrosBandeja): Promise<ReporteGestion[]> {
  const params = new URLSearchParams();
  if (filtros.estado) params.set('estado', filtros.estado);
  if (filtros.categoriaId != null) params.set('categoriaId', String(filtros.categoriaId));

  const query = params.toString();
  const reportes = await api.get<ReporteGestion[]>(
    `/api/reportes/bandeja${query ? `?${query}` : ''}`,
  );
  return filtrarPorFecha(reportes, filtros);
}

function filtrarPorFecha(reportes: ReporteGestion[], filtros: FiltrosBandeja): ReporteGestion[] {
  if (!filtros.fechaDesde && !filtros.fechaHasta) return reportes;
  // `fechaHasta` incluye el dia completo: quien filtra "hasta el 5" espera
  // ver lo reportado el 5, no solo hasta su medianoche inicial.
  const desde = filtros.fechaDesde ? new Date(`${filtros.fechaDesde}T00:00:00`) : null;
  const hasta = filtros.fechaHasta ? new Date(`${filtros.fechaHasta}T23:59:59.999`) : null;

  return reportes.filter((r) => {
    if (!r.createdAt) return true;
    const fecha = new Date(r.createdAt);
    if (desde && fecha < desde) return false;
    if (hasta && fecha > hasta) return false;
    return true;
  });
}

/** US-14: cambia el estado. El backend valida la transicion (409 si no). */
export function cambiarEstado(
  reporteId: number,
  estado: string,
  comentario?: string,
): Promise<ReporteGestion> {
  return api.patch<ReporteGestion>(`/api/reportes/${reporteId}/estado`, {
    estado,
    comentario: comentario?.trim() || undefined,
  });
}

/**
 * US-22: linea de tiempo del reporte.
 *
 * Para el funcionario del distrito el backend devuelve el detalle SIN
 * redactar (incluye el nombre del responsable asignado y el autor de cada
 * cambio); al ciudadano le entrega esas filas como un hito generico.
 */
export function historial(reporteId: number): Promise<HistorialEntrada[]> {
  return api.get<HistorialEntrada[]>(`/api/reportes/${reporteId}/historial`);
}

/**
 * US-15: responsable interno vigente, o `null` si no hay ninguno.
 *
 * El backend responde 404 cuando el reporte no tiene responsable. Eso no es
 * un fallo sino un estado normal, asi que se traduce a `null` en vez de
 * propagar un error que la pantalla tendria que interpretar.
 */
export async function responsableActivo(reporteId: number): Promise<AsignacionResponsable | null> {
  try {
    return await api.get<AsignacionResponsable>(`/api/reportes/${reporteId}/responsable`);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null;
    throw e;
  }
}

/** US-15: asigna o reasigna el responsable (texto libre: cuadrilla o persona). */
export function asignarResponsable(
  reporteId: number,
  responsable: string,
  notas?: string,
): Promise<AsignacionResponsable> {
  return api.post<AsignacionResponsable>(`/api/reportes/${reporteId}/responsable`, {
    responsable: responsable.trim(),
    notas: notas?.trim() || undefined,
  });
}

/**
 * US-28: exporta los reportes del distrito del funcionario con los filtros
 * activos de la bandeja. Se trae como `Blob` porque la descarga exige token.
 * 400 = no hay reportes que coincidan (el backend no genera archivos vacíos).
 */
export async function exportarReportes(
  filtros: FiltrosExportacion,
  formato: FormatoExportacion,
): Promise<ReportesExportados> {
  const params = parametrosDeExportacion(filtros, formato);
  const archivo = await apiDescargar(`/api/reportes/exportar?${params.toString()}`);
  return {
    contenido: archivo.contenido,
    nombreArchivo: nombreDeArchivo(archivo.contentDisposition, formato),
  };
}

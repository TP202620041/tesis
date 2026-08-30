import { api } from '@/lib/api/client';
import { ApiError } from '@/lib/api/errors';
import type { components } from '@/lib/api/generated/schema';
import type { ReporteResumen } from '@/features/reportes/api';

type Schemas = components['schemas'];
export type HistorialEntrada = Schemas['HistorialEntradaResponse'];
export type AsignacionResponsable = Schemas['AsignacionResponsableResponse'];

/**
 * API de gestion municipal (US-13, US-14, US-15, US-22).
 *
 * Todas exigen token y rol FUNCIONARIO_MUNICIPAL, y el backend valida ademas
 * que el reporte pertenezca al distrito del funcionario (403 si no). Por eso
 * NINGUNA lleva `conAuth: false`.
 */

export interface FiltrosBandeja {
  estado: string | null;
  categoriaId: number | null;
  /** Filtro por fecha, aplicado en el cliente (ver `bandeja`). */
  fechaDesde: string | null;
  fechaHasta: string | null;
}

export const FILTROS_BANDEJA_VACIOS: FiltrosBandeja = {
  estado: null,
  categoriaId: null,
  fechaDesde: null,
  fechaHasta: null,
};

/**
 * US-13: reportes del distrito del funcionario.
 *
 * `estado` y `categoriaId` los filtra el backend; el RANGO DE FECHAS no —
 * ese endpoint no acepta esos parametros (a diferencia del de exportacion de
 * US-28). Se filtra en el cliente, lo cual es correcto y no parcial porque
 * la bandeja devuelve la LISTA COMPLETA del distrito, no una pagina: no hay
 * riesgo de filtrar solo sobre un subconjunto.
 */
export async function bandeja(filtros: FiltrosBandeja): Promise<ReporteResumen[]> {
  const params = new URLSearchParams();
  if (filtros.estado) params.set('estado', filtros.estado);
  if (filtros.categoriaId != null) params.set('categoriaId', String(filtros.categoriaId));

  const query = params.toString();
  const reportes = await api.get<ReporteResumen[]>(
    `/api/reportes/bandeja${query ? `?${query}` : ''}`,
  );
  return filtrarPorFecha(reportes, filtros);
}

function filtrarPorFecha(reportes: ReporteResumen[], filtros: FiltrosBandeja): ReporteResumen[] {
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
): Promise<ReporteResumen> {
  return api.patch<ReporteResumen>(`/api/reportes/${reporteId}/estado`, {
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

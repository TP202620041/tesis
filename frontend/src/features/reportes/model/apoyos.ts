import { tieneVistaPublica } from './acciones';

/**
 * QA-1 M-6 (US-09): la sección «Reportes que apoyas» de `/mis-reportes`, con
 * los reportes de otros vecinos a los que el ciudadano se adhirió.
 */

/** Ancla de la sección (el `id` de su título). */
export const ANCLA_REPORTES_QUE_APOYAS = 'reportes-que-apoyas';

/** A dónde lleva «Ver los reportes que apoyas» tras una adhesión. */
export const RUTA_REPORTES_QUE_APOYAS = `/mis-reportes#${ANCLA_REPORTES_QUE_APOYAS}`;

/**
 * Enlace de un reporte apoyado: su detalle PÚBLICO (`/reportes/[id]`), o
 * `null` si no lo tiene.
 *
 * - Nunca `/mis-reportes/[id]`: ese detalle es del creador. Se arma desde
 *   `mis-reportes` (un reporte ajeno no está ahí) y ofrece editar y retirar,
 *   que en un reporte ajeno el backend rechaza con 403.
 * - Un CANCELADO no tiene detalle público (el backend responde 404 a
 *   cualquiera; {@link tieneVistaPublica}): lo retiró su creador, y la lista
 *   lo explica en vez de enlazar a «Reporte no disponible».
 */
export function enlaceDeReporteApoyado(reporte: { id?: number; estado?: string }): string | null {
  if (reporte.id === undefined || !tieneVistaPublica(reporte.estado ?? '')) return null;
  return `/reportes/${reporte.id}`;
}

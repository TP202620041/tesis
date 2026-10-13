import type { components } from '@/lib/api/generated/schema';
import {
  SIN_DATOS,
  formatearSatisfaccion,
  formatearTasa,
  formatearTiempo,
  type DesempenoDistrital,
} from './formato';

/**
 * US-17: respuesta de `GET /api/desempeno/mi-distrito`
 * (`DashboardDistritoResponse`).
 *
 * `resumen` es la misma fila del índice público (US-18/US-20) para el
 * distrito del funcionario, con sus métricas en `null` cuando no hay datos.
 * Siempre viene: si la vista no tuviera la fila, el backend responde 404 en
 * vez de un `resumen` vacío. Los dos contadores son `long` en el backend
 * (nunca `null`), así que su 0 sí es un cero real.
 */
export type DashboardDistrito = Omit<
  components['schemas']['DashboardDistritoResponse'],
  'resumen' | 'reportesSinResponsable' | 'reportesEstancados'
> & {
  resumen: DesempenoDistrital;
  reportesSinResponsable: number;
  reportesEstancados: number;
};

export interface Indicador {
  id: string;
  etiqueta: string;
  valor: string;
  /** Qué mide, en una línea: el funcionario no tiene por qué saber la fórmula. */
  descripcion: string;
}

/**
 * Días sin cambio de estado a partir de los cuales un reporte cuenta como
 * estancado. Lo fija el backend (`DesempenoService.DIAS_ESTANCAMIENTO`); se
 * repite aquí solo para explicarlo en pantalla.
 */
export const DIAS_ESTANCAMIENTO = 7;

function entero(n: number | null | undefined): string {
  if (n == null) return SIN_DATOS;
  return n.toLocaleString('es-PE');
}

/**
 * Indicadores del índice público para el distrito, ya formateados. Las
 * métricas en `null` se muestran "Sin datos", nunca como 0: un distrito sin
 * resueltos no tiene un tiempo promedio de 0 h, no tiene tiempo promedio.
 */
export function indicadoresDeDesempeno(resumen: DesempenoDistrital): Indicador[] {
  return [
    {
      id: 'total',
      etiqueta: 'Reportes recibidos',
      valor: entero(resumen.totalReportes),
      descripcion: 'Reportes asignados al distrito, en cualquier estado.',
    },
    {
      id: 'resueltos',
      etiqueta: 'Reportes resueltos',
      valor: entero(resumen.totalResueltos),
      descripcion: 'Reportes que llegaron al estado Resuelto.',
    },
    {
      id: 'tasa',
      etiqueta: 'Tasa de resolución',
      valor: formatearTasa(resumen.tasaResolucion),
      descripcion: 'Resueltos sobre el total de reportes del distrito.',
    },
    {
      id: 'tiempo',
      etiqueta: 'Tiempo promedio de atención',
      valor: formatearTiempo(resumen.tiempoPromedioHoras),
      descripcion: 'Desde que se reporta hasta que se resuelve.',
    },
    {
      id: 'satisfaccion',
      etiqueta: 'Satisfacción ciudadana',
      valor: formatearSatisfaccion(resumen.satisfaccionPromedio),
      descripcion: `Promedio de ${entero(resumen.totalCalificaciones)} ${
        resumen.totalCalificaciones === 1 ? 'calificación' : 'calificaciones'
      } de los vecinos.`,
    },
  ];
}

/**
 * Señales operativas internas: solo las ve el funcionario, no forman parte
 * del índice público. Son conteos para actuar, no una nota.
 */
export function indicadoresOperativos(dashboard: DashboardDistrito): Indicador[] {
  return [
    {
      id: 'sin-responsable',
      etiqueta: 'Sin responsable asignado',
      valor: entero(dashboard.reportesSinResponsable),
      descripcion: 'Reportes recibidos o en proceso que aún no tienen responsable.',
    },
    {
      id: 'estancados',
      etiqueta: 'Estancados',
      valor: entero(dashboard.reportesEstancados),
      descripcion: `Reportes abiertos sin cambio de estado hace más de ${DIAS_ESTANCAMIENTO} días.`,
    },
  ];
}

/** Fecha del último recálculo del índice, o `null` si no viene. */
export function formatearActualizacion(calculatedAt: string | null | undefined): string | null {
  if (!calculatedAt) return null;
  const fecha = new Date(calculatedAt);
  if (Number.isNaN(fecha.getTime())) return null;
  return fecha.toLocaleString('es-PE', { dateStyle: 'medium', timeStyle: 'short' });
}

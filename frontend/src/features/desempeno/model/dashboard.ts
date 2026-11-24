import type { components } from '@/lib/api/generated/schema';
import {
  DATOS_INSUFICIENTES,
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
 * US-17 Esc. 2: por debajo de este número de reportes registrados, el
 * dashboard avisa que los datos son insuficientes en lugar de presentar
 * tasas y promedios poco significativos.
 */
export const MIN_REPORTES_DASHBOARD = 5;

/** `true` si el distrito tiene menos de {@link MIN_REPORTES_DASHBOARD} reportes (US-17 Esc. 2). */
export function datosInsuficientes(resumen: DesempenoDistrital): boolean {
  return (resumen.totalReportes ?? 0) < MIN_REPORTES_DASHBOARD;
}

/**
 * Una métrica derivada (tasa, tiempo, satisfacción) con datos insuficientes:
 * si existe se reemplaza por «Datos insuficientes»; si es `null` sigue siendo
 * «Sin datos» (no hay métrica, que es otra cosa).
 */
function derivada(valor: number | null | undefined, formatear: (v: number) => string, insuficiente: boolean): string {
  if (valor == null) return SIN_DATOS;
  return insuficiente ? DATOS_INSUFICIENTES : formatear(valor);
}

/**
 * Indicadores del índice público para el distrito, ya formateados. Las
 * métricas en `null` se muestran "Sin datos", nunca como 0: un distrito sin
 * resueltos no tiene un tiempo promedio de 0 h, no tiene tiempo promedio.
 *
 * US-17 Esc. 2: con menos de {@link MIN_REPORTES_DASHBOARD} reportes, la
 * tasa, el tiempo y la satisfacción dicen «Datos insuficientes»; los conteos
 * (recibidos, resueltos) se muestran igual, porque son hechos y no promedios.
 */
export function indicadoresDeDesempeno(resumen: DesempenoDistrital): Indicador[] {
  const insuficiente = datosInsuficientes(resumen);
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
      valor: derivada(resumen.tasaResolucion, formatearTasa, insuficiente),
      descripcion: 'Resueltos sobre el total de reportes del distrito.',
    },
    {
      id: 'tiempo',
      etiqueta: 'Tiempo promedio de atención',
      valor: derivada(resumen.tiempoPromedioHoras, formatearTiempo, insuficiente),
      descripcion: 'Desde que se reporta hasta que se resuelve.',
    },
    {
      id: 'satisfaccion',
      etiqueta: 'Satisfacción ciudadana',
      valor: derivada(resumen.satisfaccionPromedio, formatearSatisfaccion, insuficiente),
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

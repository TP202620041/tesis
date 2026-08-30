import type { EstadoReporte } from '@/lib/types/domain';

/**
 * Representacion visual de cada estado en el mapa (US-10, escenario 1:
 * "leyenda de colores por estado").
 *
 * Los colores no son decorativos: son el unico canal que distingue un
 * marcador de otro, asi que se eligieron con contraste suficiente entre si
 * y sobre el mapa base. La leyenda ademas nombra cada estado en texto, de
 * modo que la informacion no dependa solo del color (accesibilidad, US-23).
 */
export interface EstiloEstado {
  etiqueta: string;
  /** Color del marcador. */
  color: string;
  /** Descripcion de lo que significa, para la leyenda. */
  descripcion: string;
}

const ESTILOS: Record<EstadoReporte, EstiloEstado> = {
  PENDIENTE: {
    etiqueta: 'Pendiente',
    color: '#dc2626',
    descripcion: 'Reportado, la municipalidad aún no lo recibe',
  },
  RECIBIDO: {
    etiqueta: 'Recibido',
    color: '#ea580c',
    descripcion: 'La municipalidad lo registró',
  },
  EN_PROCESO: {
    etiqueta: 'En proceso',
    color: '#ca8a04',
    descripcion: 'Hay trabajo en curso',
  },
  RESUELTO: {
    etiqueta: 'Resuelto',
    color: '#16a34a',
    descripcion: 'El daño fue reparado',
  },
  RECHAZADO: {
    etiqueta: 'Rechazado',
    color: '#64748b',
    descripcion: 'La municipalidad desestimó el reporte',
  },
  CANCELADO: {
    etiqueta: 'Cancelado',
    color: '#94a3b8',
    descripcion: 'El ciudadano retiró su reporte',
  },
};

/**
 * Estados que se muestran en el mapa publico y en la leyenda.
 *
 * CANCELADO queda fuera: el backend ya no lo devuelve salvo que se pida
 * explicitamente, porque es un reporte que el propio ciudadano retiro
 * estando PENDIENTE — nunca entro al flujo municipal. RECHAZADO si aparece:
 * ahi la municipalidad decidio activamente y esa decision es informacion
 * publica.
 */
export const ESTADOS_EN_MAPA: readonly EstadoReporte[] = [
  'PENDIENTE',
  'RECIBIDO',
  'EN_PROCESO',
  'RESUELTO',
  'RECHAZADO',
];

/**
 * Estados que ofrece el filtro de la bandeja municipal (US-13).
 *
 * A diferencia del mapa publico, aqui SI aparece CANCELADO: la bandeja
 * (`findBandeja`) devuelve los cancelados, y al funcionario le sirve saber
 * que un vecino retiro su reporte. La exclusion de CANCELADO se aplico solo
 * a la busqueda publica, que es donde desinformaria sobre el estado de las
 * calles.
 */
export const ESTADOS_EN_BANDEJA: readonly EstadoReporte[] = [
  ...ESTADOS_EN_MAPA,
  'CANCELADO',
];

const ESTILO_DESCONOCIDO: EstiloEstado = {
  etiqueta: 'Desconocido',
  color: '#94a3b8',
  descripcion: 'Estado no reconocido',
};

/**
 * Estilo de un estado. Tolera valores desconocidos en vez de romper: el
 * `estado` llega como `string` desde el API (los DTO lo exponen con
 * `.name()`), asi que un estado nuevo en el backend no debe dejar el mapa
 * en blanco — se dibuja en gris y el resto sigue funcionando.
 */
export function estiloDeEstado(estado: string): EstiloEstado {
  return ESTILOS[estado as EstadoReporte] ?? ESTILO_DESCONOCIDO;
}

import type { EstadoReporte } from '@/lib/types/domain';

/**
 * Representacion visual de cada estado (US-10, escenario 1: "leyenda de
 * colores por estado"), segun la capa semantica del sistema de diseno
 * (DIS-1; docs/diseno/2026-10-21-propuesta.md, §4).
 *
 * Cada estado se distingue por TRES canales: color, icono y nombre. Asi la
 * informacion nunca depende solo del color (WCAG 1.4.1, US-23): con
 * deuteranopia el rojo, el naranja y el ambar de antes se confundian.
 * Recibido pasa de naranja a azul; En proceso usa el ambar de las obras en la
 * via, con glifo oscuro. El color de la marca (tinta) nunca es un estado.
 */
export interface EstiloEstado {
  etiqueta: string;
  /** Color del marcador en el mapa (igual en los tres temas). */
  color: string;
  /** Color del glifo o texto que va ENCIMA del marcador (4.5:1 o mas). */
  glifo: string;
  /**
   * Nombre del estado en los tokens de `globals.css` (`--cv-<clave>`,
   * `--cv-<clave>-fondo`, `--cv-<clave>-texto`): el chip toma de ahi su
   * fondo y su texto, que si cambian con el tema.
   */
  clave: ClaveEstado;
  /** Icono (Lucide) del estado; el componente lo traduce a su glifo. */
  icono: IconoEstado;
  /** Descripcion de lo que significa, para la leyenda. */
  descripcion: string;
}

export type ClaveEstado =
  | 'pendiente'
  | 'recibido'
  | 'en-proceso'
  | 'resuelto'
  | 'rechazado'
  | 'cancelado';

/**
 * Icono de cada estado, por nombre y sin depender de React aqui (dominio
 * puro): `components/ui/ChipEstado.tsx` lo traduce al icono de Lucide
 * (reloj = `clock`, bandeja = `inbox`, llave = `wrench`, visto = `check`,
 * equis = `x`, menos = `minus`).
 */
export type IconoEstado = 'reloj' | 'bandeja' | 'llave' | 'visto' | 'equis' | 'menos';

const GLIFO_CLARO = '#ffffff';
const GLIFO_OSCURO = '#1a1a1a';

const ESTILOS: Record<EstadoReporte, EstiloEstado> = {
  PENDIENTE: {
    etiqueta: 'Pendiente',
    color: '#c8231b',
    glifo: GLIFO_CLARO,
    clave: 'pendiente',
    icono: 'reloj',
    descripcion: 'Reportado, la municipalidad aún no lo recibe',
  },
  RECIBIDO: {
    etiqueta: 'Recibido',
    color: '#2e6be6',
    glifo: GLIFO_CLARO,
    clave: 'recibido',
    icono: 'bandeja',
    descripcion: 'La municipalidad lo registró',
  },
  EN_PROCESO: {
    etiqueta: 'En proceso',
    color: '#f0a800',
    glifo: GLIFO_OSCURO,
    clave: 'en-proceso',
    icono: 'llave',
    descripcion: 'Hay trabajo en curso',
  },
  RESUELTO: {
    etiqueta: 'Resuelto',
    color: '#126b3f',
    glifo: GLIFO_CLARO,
    clave: 'resuelto',
    icono: 'visto',
    descripcion: 'El daño fue reparado',
  },
  RECHAZADO: {
    etiqueta: 'Rechazado',
    color: '#4b5563',
    glifo: GLIFO_CLARO,
    clave: 'rechazado',
    icono: 'equis',
    descripcion: 'La municipalidad desestimó el reporte',
  },
  CANCELADO: {
    etiqueta: 'Cancelado',
    color: '#7d8794',
    glifo: GLIFO_CLARO,
    clave: 'cancelado',
    icono: 'menos',
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
  color: '#7d8794',
  glifo: GLIFO_CLARO,
  clave: 'cancelado',
  icono: 'menos',
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

import type { NuevoReporte } from './tipos';

/**
 * US-06: un reporte creado sin conexion, guardado en el dispositivo hasta
 * que se pueda enviar.
 *
 * La foto se guarda como `ArrayBuffer` (con su nombre y tipo) y no como
 * `File`/`Blob`: es lo que IndexedDB clona en todos los navegadores sin
 * sorpresas (Safari tuvo fallos historicos guardando `Blob`), y basta para
 * reconstruir el multipart al reenviarlo.
 */
export interface ReporteEnCola {
  /** La MISMA clave que el intento original: el reenvio nunca duplica. */
  idempotencyKey: string;
  /**
   * Ciudadano que lo creo. Solo se reenvia con SU sesion: en un dispositivo
   * compartido, otro usuario no debe enviar reportes ajenos a su nombre.
   */
  usuarioId: number;
  /** ISO-8601, para ordenar y mostrar desde cuando espera. */
  creadoEn: string;
  datos: Omit<NuevoReporte, 'foto' | 'idempotencyKey'>;
  foto: FotoGuardada | null;
  /**
   * `pendiente`: se reintentara solo. `rechazado`: el backend lo rechazo por
   * una regla de negocio (400/409, p. ej. fuera de cobertura); reintentar no
   * cambiaria nada, asi que espera a que el ciudadano lo descarte.
   */
  estado: 'pendiente' | 'rechazado';
  /** Motivo del rechazo, tal como lo dio el backend. */
  motivo: string | null;
}

export interface FotoGuardada {
  contenido: ArrayBuffer;
  nombre: string;
  tipo: string;
}

/** Que hacer con un reporte en cola segun como termino su reenvio. */
export type DesenlaceDeEnvio =
  /** 2xx: se envio (o el backend reconocio la clave y devolvio el original). */
  | 'enviado'
  /** Sin red o 5xx: sigue pendiente y se deja de intentar por ahora. */
  | 'sin-conexion'
  /** 401: la sesion vencio. Sigue pendiente hasta que vuelva a iniciar sesion. */
  | 'sin-sesion'
  /** Otro 4xx: el backend lo rechaza por una regla; reintentar no sirve. */
  | 'rechazado';

/**
 * Clasifica el resultado de un reenvio a partir del status HTTP (`null` =
 * no hubo respuesta: fallo de red).
 */
export function desenlaceDeEnvio(status: number | null): DesenlaceDeEnvio {
  if (status === null || status >= 500) return 'sin-conexion';
  if (status >= 200 && status < 300) return 'enviado';
  if (status === 401) return 'sin-sesion';
  return 'rechazado';
}

/** Los reportes en cola de un ciudadano, del mas antiguo al mas nuevo. */
export function pendientesDe(cola: ReporteEnCola[], usuarioId: number): ReporteEnCola[] {
  return cola
    .filter((r) => r.usuarioId === usuarioId)
    .sort((a, b) => a.creadoEn.localeCompare(b.creadoEn));
}

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
 * no hubo respuesta: fallo de red). 408 (timeout) y 429 (demasiadas
 * peticiones) son transitorios, como la falta de red.
 */
export function desenlaceDeEnvio(status: number | null): DesenlaceDeEnvio {
  if (status === null || status >= 500 || status === 408 || status === 429) {
    return 'sin-conexion';
  }
  if (status >= 200 && status < 300) return 'enviado';
  if (status === 401) return 'sin-sesion';
  return 'rechazado';
}

const HORA = 60 * 60 * 1000;

/**
 * Vigencia de una `Idempotency-Key` en el backend (`IdempotencyKeyService`,
 * `VIGENCIA_HORAS = 48`). Pasado ese plazo el backend ya no reconoce la
 * clave: si la primera peticion SI llego, reenviarla crearia un duplicado (o
 * una adhesion de US-09). Por eso un reporte con mas de 48 h en cola no se
 * reenvia a ciegas.
 */
export const VIGENCIA_DE_LA_CLAVE_MS = 48 * HORA;

/** Plazo tras el cual un reporte rechazado o caducado se borra del dispositivo. */
export const PLAZO_DE_PURGA_MS = 30 * 24 * HORA;

/** Lo que ve el ciudadano de un reporte en cola. */
export type EstadoVisible = 'pendiente' | 'rechazado' | 'caducado';

function edad(reporte: ReporteEnCola, ahora: Date): number {
  return ahora.getTime() - new Date(reporte.creadoEn).getTime();
}

/**
 * `caducado`: pendiente con la clave ya vencida en el backend. No se reenvia
 * solo: el ciudadano revisa "Mis reportes" (pudo haber llegado) y decide si
 * lo reenvia con una clave nueva o lo descarta.
 */
export function estadoVisible(reporte: ReporteEnCola, ahora: Date): EstadoVisible {
  if (reporte.estado === 'rechazado') return 'rechazado';
  return edad(reporte, ahora) > VIGENCIA_DE_LA_CLAVE_MS ? 'caducado' : 'pendiente';
}

/** Se reenvia solo: pendiente y con la clave todavia vigente. */
export function seReenviaSolo(reporte: ReporteEnCola, ahora: Date): boolean {
  return estadoVisible(reporte, ahora) === 'pendiente';
}

/** Rechazado o caducado hace mas de {@link PLAZO_DE_PURGA_MS}: ya no se guarda. */
export function debePurgarse(reporte: ReporteEnCola, ahora: Date): boolean {
  return estadoVisible(reporte, ahora) !== 'pendiente' && edad(reporte, ahora) > PLAZO_DE_PURGA_MS;
}

/** Los reportes en cola de un ciudadano, del mas antiguo al mas nuevo. */
export function pendientesDe(cola: ReporteEnCola[], usuarioId: number): ReporteEnCola[] {
  return cola
    .filter((r) => r.usuarioId === usuarioId)
    .sort((a, b) => a.creadoEn.localeCompare(b.creadoEn));
}

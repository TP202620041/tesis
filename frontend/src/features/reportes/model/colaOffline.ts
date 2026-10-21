import { esSeveridad, type Severidad } from '@/lib/types/domain';
import { esTituloValido } from './titulo';
import type { NuevoReporte } from './tipos';

/**
 * Datos del formulario guardados con el reporte. `titulo` y `severidad`
 * (NC-02) son opcionales AQUI aunque el formulario los exija: la cola puede
 * tener reportes armados por la version anterior, que no los tenia. No se
 * migra el esquema de IndexedDB: un reporte sin ellos se reconoce porque le
 * faltan (ver {@link estaIncompleto}).
 */
export type DatosEnCola = Omit<NuevoReporte, 'foto' | 'idempotencyKey' | 'titulo' | 'severidad'> & {
  titulo?: string;
  severidad?: Severidad;
};

/** Lo que el ciudadano agrega a un reporte incompleto para poder enviarlo. */
export interface DatosParaCompletar {
  titulo: string;
  severidad: Severidad;
}

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
  datos: DatosEnCola;
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
  /**
   * 401: la sesion vencio. Tambien el 403 `TERMINOS_PENDIENTES` (NC-07b):
   * la sesion sirve, pero no se puede usar hasta aceptar los terminos.
   * Sigue pendiente hasta que se pueda volver a enviar.
   */
  | 'sin-sesion'
  /** Otro 4xx: el backend lo rechaza por una regla; reintentar no sirve. */
  | 'rechazado';

/**
 * Clasifica el resultado de un reenvio a partir del status HTTP (`null` =
 * no hubo respuesta: fallo de red). 408 (timeout) y 429 (demasiadas
 * peticiones) son transitorios, como la falta de red.
 *
 * `terminosPendientes`: el 403 vino con `codigo: "TERMINOS_PENDIENTES"`
 * (NC-07b). No es un rechazo del reporte: marcarlo `rechazado` lo sacaria
 * del reenvio automatico por algo que se resuelve aceptando los terminos.
 */
export function desenlaceDeEnvio(
  status: number | null,
  { terminosPendientes = false }: { terminosPendientes?: boolean } = {},
): DesenlaceDeEnvio {
  if (status === null || status >= 500 || status === 408 || status === 429) {
    return 'sin-conexion';
  }
  if (status >= 200 && status < 300) return 'enviado';
  if (status === 401) return 'sin-sesion';
  if (status === 403 && terminosPendientes) return 'sin-sesion';
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
export type EstadoVisible = 'pendiente' | 'rechazado' | 'caducado' | 'incompleto';

/**
 * NC-02: el reporte no tiene un titulo valido o una severidad (lo armo la
 * version anterior del formulario). El backend lo rechazaria con 400, asi
 * que no se envia hasta que el ciudadano lo complete. Se deduce de los
 * datos, sin un campo nuevo en IndexedDB.
 */
export function estaIncompleto(reporte: ReporteEnCola): boolean {
  return !esTituloValido(reporte.datos.titulo) || !esSeveridad(reporte.datos.severidad);
}

function edad(reporte: ReporteEnCola, ahora: Date): number {
  return ahora.getTime() - new Date(reporte.creadoEn).getTime();
}

/**
 * - `incompleto` (NC-02) va primero, aunque este `rechazado`: si el backend
 *   lo rechazo con 400 por faltar el titulo o la severidad, completarlo es
 *   justamente la salida (y completarlo lo vuelve a `pendiente`).
 * - `caducado`: pendiente con la clave ya vencida en el backend. No se
 *   reenvia solo: el ciudadano revisa "Mis reportes" (pudo haber llegado) y
 *   decide si lo reenvia con una clave nueva o lo descarta. Un incompleto con
 *   mas de 48 h pasa a `caducado` al completarlo.
 */
export function estadoVisible(reporte: ReporteEnCola, ahora: Date): EstadoVisible {
  if (estaIncompleto(reporte)) return 'incompleto';
  if (reporte.estado === 'rechazado') return 'rechazado';
  return edad(reporte, ahora) > VIGENCIA_DE_LA_CLAVE_MS ? 'caducado' : 'pendiente';
}

/** Se reenvia solo: pendiente, completo y con la clave todavia vigente. */
export function seReenviaSolo(reporte: ReporteEnCola, ahora: Date): boolean {
  return estadoVisible(reporte, ahora) === 'pendiente';
}

/**
 * Rechazado o caducado hace mas de {@link PLAZO_DE_PURGA_MS}: ya no se
 * guarda. Un `incompleto` nunca se purga solo: el ciudadano no lo eligio
 * dejar asi (lo armo la version anterior), asi que solo sale si lo completa
 * y se envia, o si el lo descarta.
 */
export function debePurgarse(reporte: ReporteEnCola, ahora: Date): boolean {
  const visible = estadoVisible(reporte, ahora);
  return (
    (visible === 'rechazado' || visible === 'caducado') && edad(reporte, ahora) > PLAZO_DE_PURGA_MS
  );
}

/** Los reportes en cola de un ciudadano, del mas antiguo al mas nuevo. */
export function pendientesDe(cola: ReporteEnCola[], usuarioId: number): ReporteEnCola[] {
  return cola
    .filter((r) => r.usuarioId === usuarioId)
    .sort((a, b) => a.creadoEn.localeCompare(b.creadoEn));
}

import type { ApiErrorBody } from '@/lib/types/domain';

/**
 * Error de una llamada al API, con el `status` HTTP y el mensaje que el
 * backend ya devuelve traducido en `ApiError.message`.
 *
 * El backend usa los codigos de forma consistente y el frontend depende de
 * esa semantica, asi que conviene tenerla escrita:
 *
 * - `400` validacion de entrada (`@Valid`, coordenadas fuera de rango).
 * - `401` sin token o token invalido/vencido.
 * - `403` autenticado pero sin permiso (otro rol, otro distrito, no es el
 *   creador del reporte). Con `codigo: "TERMINOS_PENDIENTES"` (NC-07b, D-12)
 *   no es falta de permiso: el usuario aun no acepto los terminos vigentes
 *   (lo resuelve `client.ts`, que lleva a la pantalla de aceptacion).
 * - `404` recurso inexistente.
 * - `409` precondicion de negocio incumplida: transicion de estado invalida
 *   (US-14), reporte duplicado del mismo ciudadano (US-09), ya calificado
 *   (US-26), token de recuperacion usado o vencido (US-03).
 */
export class ApiError extends Error {
  readonly status: number;
  readonly path: string;
  readonly details: string[];
  /**
   * Codigo de maquina del backend (`ApiError.codigo`), o `null` si no vino:
   * el backend lo omite del JSON cuando no hay. Hoy solo existe
   * {@link CODIGO_TERMINOS_PENDIENTES}.
   */
  readonly codigo: string | null;

  constructor(
    status: number,
    message: string,
    path = '',
    details: string[] = [],
    codigo: string | null = null,
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.path = path;
    this.details = details;
    this.codigo = codigo;
  }

  /** `true` si el fallo es de negocio y tiene sentido mostrarlo al usuario. */
  get esDeNegocio(): boolean {
    return this.status === 400 || this.status === 409;
  }

  get esNoAutenticado(): boolean {
    return this.status === 401;
  }

  get esSinPermiso(): boolean {
    return this.status === 403;
  }

  /** 403 porque faltan los terminos vigentes (D-12), no por falta de rol o relacion. */
  get esTerminosPendientes(): boolean {
    return this.status === 403 && this.codigo === CODIGO_TERMINOS_PENDIENTES;
  }
}

/**
 * NC-07b (D-12): con los terminos vigentes sin aceptar, toda ruta privada
 * (salvo `/me`, `/me/consentimientos/**` y la baja de la suscripcion push)
 * responde 403 con este codigo.
 */
export const CODIGO_TERMINOS_PENDIENTES = 'TERMINOS_PENDIENTES';

/**
 * Error de red: el request nunca llego al backend (sin conexion, DNS, CORS).
 * Se distingue de {@link ApiError} porque es el caso que la cola de
 * sincronizacion offline (US-06) debe reintentar, no reportar como fallo.
 */
export class NetworkError extends Error {
  constructor(message = 'No se pudo conectar con el servidor') {
    super(message);
    this.name = 'NetworkError';
  }
}

/** Error listo para mostrar: mensaje general y detalle por campo (si lo hay). */
export interface MensajeDeError {
  mensaje: string;
  detalles: string[];
}

/**
 * Traduce cualquier error de una llamada al API a algo que la UI puede
 * mostrar (ARCHITECTURE.md §5.2: lo usan los hooks, no los componentes).
 *
 * - {@link NetworkError}: no hubo respuesta, asi que no hay mensaje del
 *   backend que mostrar.
 * - {@link ApiError}: el backend ya devuelve el mensaje en español, y en un
 *   400 de `@Valid` el detalle por campo viene en `details`.
 * - Cualquier otra cosa es un error de programacion: mensaje generico.
 */
export function mensajeDeError(e: unknown): MensajeDeError {
  if (e instanceof NetworkError) {
    return { mensaje: 'Sin conexión con el servidor. Revisa tu red.', detalles: [] };
  }
  if (e instanceof ApiError) {
    return { mensaje: e.message, detalles: e.details };
  }
  return { mensaje: 'Ocurrió un error inesperado.', detalles: [] };
}

/** Construye un {@link ApiError} desde la respuesta, tolerando cuerpos no-JSON. */
export async function desdeRespuesta(respuesta: Response): Promise<ApiError> {
  let cuerpo: Partial<ApiErrorBody> = {};
  try {
    cuerpo = (await respuesta.json()) as Partial<ApiErrorBody>;
  } catch {
    // 401 del entry point y algunos errores de Spring vienen sin cuerpo JSON.
  }
  return new ApiError(
    respuesta.status,
    cuerpo.message ?? mensajePorDefecto(respuesta.status),
    cuerpo.path ?? '',
    cuerpo.details ?? [],
    cuerpo.codigo ?? null,
  );
}

function mensajePorDefecto(status: number): string {
  switch (status) {
    case 401:
      return 'Tu sesión expiró o no iniciaste sesión.';
    case 403:
      return 'No tienes permiso para realizar esta acción.';
    case 404:
      return 'No se encontró el recurso solicitado.';
    default:
      return 'Ocurrió un error inesperado. Intenta nuevamente.';
  }
}

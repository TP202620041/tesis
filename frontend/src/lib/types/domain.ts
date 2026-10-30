/**
 * Refinamientos de dominio sobre los tipos generados del OpenAPI.
 *
 * Los tipos de `generated/schema.ts` se generan con `npm run api:types` y NO
 * se editan a mano. Este archivo existe porque el spec que produce springdoc
 * tiene dos limitaciones que no se pueden arreglar del lado del backend sin
 * ensuciarlo:
 *
 * 1. Los records de Java no llevan informacion de nulabilidad, asi que
 *    springdoc marca practicamente todo campo de respuesta como opcional
 *    (`id?`, `email?`). Usar eso crudo obligaria a `?.` y `!` en campos que
 *    en la practica siempre vienen.
 * 2. Los enums viajan como `string` plano porque los DTO los exponen con
 *    `.name()`. Aqui se recuperan como uniones literales, que es lo que
 *    permite exhaustividad en los `switch` del frontend.
 *
 * Los valores de las uniones estan verificados contra los enums reales del
 * backend (`auth/domain/Rol.java`, `reportes/domain/EstadoReporte.java`, etc.).
 */
import type { components } from '@/lib/api/generated/schema';

type Schemas = components['schemas'];

/* -------------------------------------------------------------------------
 * Uniones de enums (el spec las entrega como `string`)
 * ---------------------------------------------------------------------- */

export const ROLES = ['CIUDADANO', 'FUNCIONARIO_MUNICIPAL', 'ADMIN'] as const;
export type Rol = (typeof ROLES)[number];

/**
 * Maquina de estados del reporte (US-14). `RESUELTO`, `RECHAZADO` y
 * `CANCELADO` son terminales; el backend valida las transiciones.
 */
export const ESTADOS_REPORTE = [
  'PENDIENTE',
  'RECIBIDO',
  'EN_PROCESO',
  'RESUELTO',
  'RECHAZADO',
  'CANCELADO',
] as const;
export type EstadoReporte = (typeof ESTADOS_REPORTE)[number];

/**
 * NC-02: severidad del daño, declarada por el ciudadano al reportar
 * (`reportes/domain/Severidad.java`), en orden BAJA < MEDIA < ALTA. Es un
 * dato publico (va en el resumen), no una señal operativa. No tiene valor
 * por defecto en el API: el formulario obliga a elegirla.
 *
 * Nulabilidad: en `ReporteResumen` y `ReporteGestion` siempre viene (la
 * migracion V17 relleno los reportes existentes). En la respuesta del POST
 * puede llegar `null` si es el reenvio idempotente de un envio que el
 * backend proceso antes de NC-02 (la respuesta guardada no la tiene).
 */
export const SEVERIDADES = ['BAJA', 'MEDIA', 'ALTA'] as const;
export type Severidad = (typeof SEVERIDADES)[number];

export function esSeveridad(valor: unknown): valor is Severidad {
  return typeof valor === 'string' && (SEVERIDADES as readonly string[]).includes(valor);
}

export const PREFERENCIAS_NOTIFICACION = ['PUSH', 'EMAIL', 'AMBAS'] as const;
export type PreferenciaNotificacion = (typeof PREFERENCIAS_NOTIFICACION)[number];

export const CANALES_NOTIFICACION = ['PUSH', 'EMAIL'] as const;
export type CanalNotificacion = (typeof CANALES_NOTIFICACION)[number];

export const TIPOS_EVENTO_HISTORIAL = ['CAMBIO_ESTADO', 'ASIGNACION'] as const;
export type TipoEventoHistorial = (typeof TIPOS_EVENTO_HISTORIAL)[number];

/** US-25: estado de un ticket de soporte (`soporte/domain/EstadoTicket.java`). */
export const ESTADOS_TICKET = ['ABIERTO', 'EN_PROCESO', 'CERRADO'] as const;
export type EstadoTicket = (typeof ESTADOS_TICKET)[number];

export function esEstadoTicket(valor: unknown): valor is EstadoTicket {
  return typeof valor === 'string' && (ESTADOS_TICKET as readonly string[]).includes(valor);
}

/**
 * NC-07b (D-12): finalidad de un consentimiento
 * (`auth/domain/FinalidadConsentimiento.java`). Cada una se acepta y se
 * revoca por separado; los terminos no se revocan desde la app (es la baja
 * de la cuenta).
 */
export const FINALIDADES_CONSENTIMIENTO = [
  'TERMINOS_Y_PRIVACIDAD',
  'NOTIFICACIONES_PUSH',
  'NOTIFICACIONES_CORREO',
] as const;
export type FinalidadConsentimiento = (typeof FINALIDADES_CONSENTIMIENTO)[number];

export function esFinalidadConsentimiento(valor: unknown): valor is FinalidadConsentimiento {
  return (
    typeof valor === 'string' && (FINALIDADES_CONSENTIMIENTO as readonly string[]).includes(valor)
  );
}

/* -------------------------------------------------------------------------
 * Alias de dominio: campos siempre presentes + enums tipados
 * ---------------------------------------------------------------------- */

/** Vuelve requeridas las claves `K` de `T`. */
type Requerido<T, K extends keyof T> = Omit<T, K> & Required<Pick<T, K>>;

/**
 * Usuario autenticado. `id`/`email`/`nombre`/`apellido`/`rol` siempre vienen:
 * son columnas NOT NULL en `usuario` y `UsuarioResponse.from` las mapea
 * directo. `distritoId`/`fotoUrl` si son genuinamente opcionales.
 * `debeAceptarTerminos` (NC-07b) es un `boolean` primitivo en el record:
 * siempre viene.
 */
export type Usuario = Requerido<
  Omit<Schemas['UsuarioResponse'], 'rol' | 'preferenciaNotificacion'>,
  'id' | 'email' | 'nombre' | 'apellido' | 'debeAceptarTerminos'
> & {
  rol: Rol;
  preferenciaNotificacion: PreferenciaNotificacion;
};

/**
 * Respuesta de `POST /api/auth/login`. Desde NC-09 el registro ya no la
 * devuelve: la cuenta nace sin confirmar y no inicia sesión.
 */
export type SesionIniciada = Requerido<
  Omit<Schemas['AuthResponse'], 'usuario'>,
  'token' | 'tokenType' | 'expiresInMinutes'
> & {
  usuario: Usuario;
};

export type RegistroRequest = Schemas['RegistroRequest'];
export type LoginRequest = Schemas['LoginRequest'];

/**
 * NC-09: respuesta 201 de `POST /api/auth/registro` (`RegistroResponse`). La
 * cuenta queda creada sin confirmar y SIN sesión; el correo trae un enlace
 * que vence en `vigenciaEnlaceHoras`. Los dos campos son `NOT NULL` en el
 * record del backend: siempre vienen.
 */
export type CuentaPorConfirmar = Requerido<Schemas['RegistroResponse'], 'email' | 'vigenciaEnlaceHoras'>;
/** NC-09: `POST /api/auth/confirmar-correo` (204, o 409 con `codigo`). */
export type ConfirmarCorreoRequest = Schemas['ConfirmarCorreoRequest'];
/** NC-09: `POST /api/auth/reenviar-confirmacion` (202 siempre, exista o no la cuenta). */
export type ReenviarConfirmacionRequest = Schemas['ReenviarConfirmacionRequest'];

/** US-03: `POST /api/auth/recuperar-password` (responde 202 exista o no la cuenta). */
export type RecuperarPasswordRequest = Schemas['RecuperarPasswordRequest'];
/** US-03: `POST /api/auth/restablecer-password` con el token que llegó por correo. */
export type RestablecerPasswordRequest = Schemas['RestablecerPasswordRequest'];

/** Cuerpo de error estandar del backend (`common/exception/ApiError.java`). */
export interface ApiErrorBody {
  timestamp: string;
  status: number;
  error: string;
  message: string;
  path: string;
  details: string[];
  /**
   * Codigo de maquina; el backend lo omite si no hay. Hoy:
   * `TERMINOS_PENDIENTES` (D-12), los de la confirmacion del correo (NC-09,
   * `features/auth/model/confirmacion.ts`) y los de la moderacion (NC-10b,
   * `lib/types/moderacion.ts`).
   */
  codigo?: string;
}

/** Distrito como dato de referencia para selectores (US-05, US-10, US-12). */
export type Distrito = Requerido<Schemas['DistritoResponse'], 'id' | 'nombre'>;

/** Categoria de dano seleccionable (US-05, US-29). */
export type CategoriaDano = Requerido<
  Schemas['CategoriaDanoResponse'],
  'id' | 'nombre' | 'esEstandar'
>;

/**
 * NC-04: respuesta de `POST /api/clasificaciones`, la vista previa de la
 * categoria que sugiere la foto (handoff `2026-10-25-clasificacion-vista-previa`).
 * Los dos campos son `null` a la vez cuando no hay sugerencia. A proposito no
 * trae confianza ni version del modelo: la sugerencia es una señal interna.
 *
 * Alias del schema generado con la nulabilidad real: springdoc marca los
 * campos como opcionales, pero el record siempre los envia (`null` cuando no
 * hay sugerencia).
 *
 * NC-10b: `fotoRechazada` es `boolean` y siempre viene (primitivo en el
 * record). `true` solo si la moderacion rechazo la foto, y entonces la
 * categoria es `null`; `false` tambien si no se pudo moderar (el veredicto
 * oficial es el de la creacion). Nunca viene el puntaje.
 */
type CamposDeLaSugerencia = Omit<Schemas['ClasificacionResponse'], 'fotoRechazada'>;
export type ClasificacionResponse = {
  [K in keyof CamposDeLaSugerencia]-?: NonNullable<CamposDeLaSugerencia[K]> | null;
} & {
  fotoRechazada: boolean;
};

/**
 * US-22: una fila de la linea de tiempo del reporte (cambio de estado o
 * asignacion). Vive aqui y no en una feature porque la usan `reportes`
 * (vista del ciudadano), `gestion` (vista del funcionario) y el componente
 * compartido `LineaDeTiempo`, que no puede depender de features.
 */
export type HistorialEntrada = Schemas['HistorialEntradaResponse'];

export function esRol(valor: unknown): valor is Rol {
  return typeof valor === 'string' && (ROLES as readonly string[]).includes(valor);
}

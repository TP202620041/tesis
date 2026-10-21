import { api, apiFetch, fotoRequiereAuth } from '@/lib/api/client';
import { ApiError } from '@/lib/api/errors';
import { borrarToken, guardarToken } from '@/lib/auth/token-storage';
import type { components } from '@/lib/api/generated/schema';
import {
  desdeRespuestaDeConsentimientos,
  type Consentimientos,
  type FinalidadOpcional,
} from './model/consentimientos';
import type {
  FinalidadConsentimiento,
  LoginRequest,
  PreferenciaNotificacion,
  RecuperarPasswordRequest,
  RegistroRequest,
  RestablecerPasswordRequest,
  SesionIniciada,
  Usuario,
} from '@/lib/types/domain';

/**
 * Llamadas al API de autenticacion (US-01, US-02, US-03, US-04).
 *
 * `registro`, `login`, `recuperar-password` y `restablecer-password` son las
 * unicas rutas que se llaman sin token (`conAuth: false`): en el backend
 * estan en `RUTAS_PUBLICAS`.
 */

/** US-01: registra una cuenta ciudadana y deja la sesion iniciada. */
export async function registrar(datos: RegistroRequest): Promise<SesionIniciada> {
  const sesion = await api.post<SesionIniciada>('/api/auth/registro', datos, {
    conAuth: false,
  });
  guardarToken(sesion.token);
  return sesion;
}

/** US-02: inicia sesion y persiste el token para las llamadas siguientes. */
export async function iniciarSesion(datos: LoginRequest): Promise<SesionIniciada> {
  const sesion = await api.post<SesionIniciada>('/api/auth/login', datos, {
    conAuth: false,
  });
  guardarToken(sesion.token);
  return sesion;
}

/**
 * US-03, paso 1: pide que se envie un token de recuperacion al correo.
 *
 * El backend responde 202 exista o no la cuenta (no revela que correos
 * estan registrados), asi que aqui no hay resultado que interpretar: solo
 * puede fallar por validacion (400) o por red.
 */
export async function solicitarRecuperacion(datos: RecuperarPasswordRequest): Promise<void> {
  await api.post<void>('/api/auth/recuperar-password', datos, { conAuth: false });
}

/**
 * US-03, paso 2: fija la contrasena nueva con el token recibido por correo.
 * 404 = token invalido; 409 = token vencido o ya usado. No inicia sesion:
 * el usuario vuelve al login con su contrasena nueva.
 */
export async function restablecerPassword(datos: RestablecerPasswordRequest): Promise<void> {
  await api.post<void>('/api/auth/restablecer-password', datos, { conAuth: false });
}

/** Usuario autenticado segun el token actual. Sirve para validar la sesion. */
export function obtenerUsuarioActual(): Promise<Usuario> {
  return api.get<Usuario>('/api/auth/me');
}

/**
 * `GET /api/auth/me` para trabajo en segundo plano (la cola offline de
 * US-06): con un token vencido (401) devuelve `null` y borra el token, pero
 * no lleva al login (`redirigirEn401: false`). Cualquier otro fallo (red,
 * 5xx) se LANZA: "no se pudo averiguar" no es "no hay sesion", y quien llama
 * debe volver a intentarlo.
 */
export async function usuarioActualSinRedirigir(): Promise<Usuario | null> {
  try {
    return await api.get<Usuario>('/api/auth/me', { redirigirEn401: false });
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) return null;
    throw e;
  }
}

export interface CambiosDePerfil {
  nombre?: string;
  apellido?: string;
  /** Distrito de RESIDENCIA del ciudadano (no el de un reporte). */
  distritoId?: number | null;
  foto?: File | null;
}

/**
 * US-30: edita el perfil. PATCH parcial — lo que no se envia no se toca.
 *
 * Va como multipart porque puede llevar la foto, mismo patron que la
 * creacion de reportes (US-05). Solo CIUDADANO: para el funcionario el
 * campo `distrito` es su jurisdiccion de gestion, y cambiarla seria otro
 * caso de uso.
 */
export function editarPerfil(cambios: CambiosDePerfil): Promise<Usuario> {
  const cuerpo = new FormData();
  if (cambios.nombre !== undefined) cuerpo.append('nombre', cambios.nombre);
  if (cambios.apellido !== undefined) cuerpo.append('apellido', cambios.apellido);
  if (cambios.distritoId != null) cuerpo.append('distritoId', String(cambios.distritoId));
  if (cambios.foto) cuerpo.append('foto', cambios.foto);

  return apiFetch<Usuario>('/api/auth/me', { method: 'PATCH', body: cuerpo });
}

/** US-30: canal por el que el ciudadano quiere recibir avisos de sus reportes. */
export function actualizarPreferenciaNotificacion(
  preferenciaNotificacion: PreferenciaNotificacion,
): Promise<Usuario> {
  return api.patch<Usuario>('/api/auth/me/preferencia-notificacion', {
    preferenciaNotificacion,
  });
}

/** NC-07b: consentimientos vigentes, historial y version vigente de los terminos. */
export async function obtenerConsentimientos(): Promise<Consentimientos> {
  const r = await api.get<components['schemas']['ConsentimientosResponse']>(
    '/api/auth/me/consentimientos',
  );
  return desdeRespuestaDeConsentimientos(r);
}

/**
 * NC-07b: acepta una finalidad. Idempotente: si ya estaba vigente con esa
 * version, el backend responde 200 sin duplicar. Para los terminos, una
 * version que no es la vigente da 409.
 */
export async function aceptarConsentimiento(
  finalidad: FinalidadConsentimiento,
  version: string,
): Promise<void> {
  await api.post<unknown>('/api/auth/me/consentimientos', { finalidad, version });
}

/**
 * NC-07b: revoca una finalidad (204, idempotente). Revocar
 * `NOTIFICACIONES_PUSH` borra en el servidor TODAS las suscripciones push
 * del usuario. Los terminos no se revocan (409): es la baja de la cuenta.
 */
export async function revocarConsentimiento(finalidad: FinalidadOpcional): Promise<void> {
  await api.delete<void>(`/api/auth/me/consentimientos/${finalidad}`);
}

/**
 * US-21: clave publica VAPID del servidor (base64url), o `null` si el
 * servidor no tiene claves (404): entonces no se ofrece push. Es publica.
 */
export async function clavePublicaVapid(): Promise<string | null> {
  try {
    const r = await api.get<components['schemas']['ClavePublicaVapidResponse']>(
      '/api/notificaciones/vapid-public-key',
      { conAuth: false },
    );
    return r.clavePublica ?? null;
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null;
    throw e;
  }
}

/**
 * Opciones de las llamadas de push que corren solas (al iniciar o cerrar
 * sesion): `enSegundoPlano` evita navegar al login o a la pantalla de
 * terminos por un 401/403 que el usuario no provoco.
 */
interface OpcionesPush {
  enSegundoPlano?: boolean;
}

/**
 * US-21 / NC-07: registra (o reasigna al usuario actual, y reactiva) la
 * suscripcion de este navegador. Upsert por `endpoint`: 201 o 200. Sin el
 * consentimiento `NOTIFICACIONES_PUSH` vigente, 409.
 */
export async function registrarSuscripcionPush(
  suscripcion: PushSubscriptionJSON,
  userAgent: string,
  { enSegundoPlano = false }: OpcionesPush = {},
): Promise<void> {
  await api.post<unknown>(
    '/api/notificaciones/suscripciones',
    { ...suscripcion, userAgent },
    { redirigirEn401: !enSegundoPlano },
  );
}

/**
 * US-21 / NC-07: da de baja SOLO este navegador (sin retirar el permiso).
 * Un 404 (ya no existia, o es de otro usuario) cuenta como hecho.
 */
export async function darDeBajaSuscripcionPush(
  endpoint: string,
  { enSegundoPlano = false }: OpcionesPush = {},
): Promise<void> {
  try {
    await api.delete<void>('/api/notificaciones/suscripciones', {
      json: { endpoint },
      redirigirEn401: !enSegundoPlano,
    });
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return;
    throw e;
  }
}

/**
 * US-30: descarga la foto de PERFIL y devuelve una URL `blob:` local.
 *
 * No puede ser un `<img src>` normal: la foto de un reporte es publica y se
 * sirve como estatico, pero la de perfil se entrega por
 * `GET /api/perfiles/fotos/{archivo}`, que exige la cabecera `Authorization`
 * y comprueba que quien la pide sea su dueno. El navegador no adjunta esa
 * cabecera al resolver un `src`, asi que un `<img>` directo recibe 401.
 * Se pide con `apiFetch` (que pone el token), se queda el `Blob` y se
 * convierte en una URL local con `URL.createObjectURL`.
 *
 * Quien la use DEBE liberarla con `URL.revokeObjectURL` al cambiar de foto
 * o desmontar (lo hace `hooks/useFotoDePerfil`); si no, el blob queda
 * retenido toda la sesion.
 */
export async function descargarFotoDePerfil(fotoUrl: string): Promise<string> {
  // Defensa contra un cambio futuro del backend: si la URL dejara de ser
  // autenticada, no hace falta este rodeo.
  if (!fotoRequiereAuth(fotoUrl)) {
    return fotoUrl;
  }
  const blob = await apiFetch<Blob>(fotoUrl, { method: 'GET', comoBlob: true });
  return URL.createObjectURL(blob);
}

/**
 * US-04: cerrar sesion es puramente del lado del cliente — se descarta el
 * token. El backend no tiene blacklist a proposito (decision documentada en
 * su README); el token sigue siendo valido hasta que expira.
 */
export function cerrarSesion(): void {
  borrarToken();
}

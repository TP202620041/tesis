import { api, apiFetch } from '@/lib/api/client';
import { borrarToken, guardarToken } from '@/lib/auth/token-storage';
import type {
  LoginRequest,
  PreferenciaNotificacion,
  RegistroRequest,
  SesionIniciada,
  Usuario,
} from '@/lib/types/domain';

/**
 * Llamadas al API de autenticacion (US-01, US-02, US-04).
 *
 * `registro` y `login` son las dos unicas rutas que se llaman sin token
 * (`conAuth: false`): en el backend estan en `RUTAS_PUBLICAS`.
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

/** Usuario autenticado segun el token actual. Sirve para validar la sesion. */
export function obtenerUsuarioActual(): Promise<Usuario> {
  return api.get<Usuario>('/api/auth/me');
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

/**
 * US-04: cerrar sesion es puramente del lado del cliente — se descarta el
 * token. El backend no tiene blacklist a proposito (decision documentada en
 * su README); el token sigue siendo valido hasta que expira.
 */
export function cerrarSesion(): void {
  borrarToken();
}

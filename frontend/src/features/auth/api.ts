import { api } from '@/lib/api/client';
import { borrarToken, guardarToken } from '@/lib/auth/token-storage';
import type {
  LoginRequest,
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

/**
 * US-04: cerrar sesion es puramente del lado del cliente — se descarta el
 * token. El backend no tiene blacklist a proposito (decision documentada en
 * su README); el token sigue siendo valido hasta que expira.
 */
export function cerrarSesion(): void {
  borrarToken();
}

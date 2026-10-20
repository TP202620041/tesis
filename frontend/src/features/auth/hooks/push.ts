import { navegadorPush, type NavegadorPush } from '@/pwa/push';
import { clavePublicaVapid, darDeBajaSuscripcionPush, registrarSuscripcionPush } from '../api';
import { base64UrlABytes, esLaMismaClave, type EstadoPush } from '../model/push';

/**
 * US-21: orquestacion de la suscripcion Web Push de este navegador.
 *
 * Funciones (no hooks) porque las usan el perfil (`usePushEnEsteNavegador`),
 * el inicio de sesion, la aceptacion de terminos y el cierre de sesion. El
 * navegador y el API entran por parametro, con los reales por defecto: asi
 * se prueban con dobles (en jsdom no hay push real).
 */

/** El API de push, tal como lo usa la orquestacion. */
export interface ServidorPush {
  clavePublica(): Promise<string | null>;
  registrar(suscripcion: PushSubscriptionJSON, userAgent: string): Promise<void>;
  darDeBaja(endpoint: string): Promise<void>;
}

// Funciones flecha (y no la referencia directa): el binding del API se lee
// al llamar, no al cargar el modulo.
const servidorEnPrimerPlano: ServidorPush = {
  clavePublica: () => clavePublicaVapid(),
  registrar: (s, ua) => registrarSuscripcionPush(s, ua),
  darDeBaja: (e) => darDeBajaSuscripcionPush(e),
};

/** Para lo que corre solo: nunca navega por un 401/403. */
const servidorEnSegundoPlano: ServidorPush = {
  clavePublica: () => clavePublicaVapid(),
  registrar: (s, ua) => registrarSuscripcionPush(s, ua, { enSegundoPlano: true }),
  darDeBaja: (e) => darDeBajaSuscripcionPush(e, { enSegundoPlano: true }),
};

/** Tope de espera de la baja al cerrar sesion: cerrar sesion nunca se cuelga. */
export const TOPE_BAJA_AL_CERRAR_MS = 3_000;

/**
 * Estado de push en este navegador, para mostrarlo en el perfil. Sin la
 * clave del servidor no se ofrece push (`sin-claves`).
 */
export async function estadoDePush(
  nav: NavegadorPush = navegadorPush,
  servidor: ServidorPush = servidorEnPrimerPlano,
): Promise<EstadoPush> {
  if (!nav.soportado()) return 'no-soportado';
  if ((await servidor.clavePublica()) === null) return 'sin-claves';
  if (nav.permiso() === 'denied') return 'denegado';
  return (await nav.suscripcionActual()) ? 'activo' : 'inactivo';
}

/**
 * Suscripcion de este navegador hecha con `clave`: reutiliza la actual si
 * coincide; si se hizo con otra clave (rotacion VAPID), la cancela y se
 * vuelve a suscribir.
 */
async function suscripcionConClave(nav: NavegadorPush, clave: string): Promise<PushSubscription> {
  const bytes = base64UrlABytes(clave);
  const actual = await nav.suscripcionActual();
  if (actual && esLaMismaClave(actual.options.applicationServerKey, bytes)) return actual;
  if (actual) await actual.unsubscribe();
  return nav.suscribir(bytes);
}

/**
 * Activa push en este navegador (el consentimiento `NOTIFICACIONES_PUSH` ya
 * debe estar otorgado: sin el, el registro da 409 y se lanza ese error).
 * Orden del handoff: clave del servidor → permiso del navegador →
 * `subscribe` → `POST` de la suscripcion.
 */
export async function activarPush(
  nav: NavegadorPush = navegadorPush,
  servidor: ServidorPush = servidorEnPrimerPlano,
): Promise<EstadoPush> {
  if (!nav.soportado()) return 'no-soportado';
  const clave = await servidor.clavePublica();
  if (clave === null) return 'sin-claves';
  const permiso = await nav.pedirPermiso();
  if (permiso !== 'granted') return permiso === 'denied' ? 'denegado' : 'inactivo';
  const suscripcion = await suscripcionConClave(nav, clave);
  await servidor.registrar(suscripcion.toJSON(), nav.userAgent());
  return 'activo';
}

/**
 * Desactiva push SOLO en este navegador: baja en el servidor y
 * `unsubscribe()`. Con `soloLocal` no avisa al servidor (p. ej. tras
 * retirar el consentimiento, que ya borro todas las suscripciones).
 */
export async function desactivarPush(
  { soloLocal = false }: { soloLocal?: boolean } = {},
  nav: NavegadorPush = navegadorPush,
  servidor: ServidorPush = servidorEnPrimerPlano,
): Promise<EstadoPush> {
  if (!nav.soportado()) return 'no-soportado';
  const suscripcion = await nav.suscripcionActual();
  if (suscripcion) {
    if (!soloLocal) await servidor.darDeBaja(suscripcion.endpoint);
    await suscripcion.unsubscribe();
  }
  return 'inactivo';
}

/**
 * Al iniciar sesion (o al aceptar los terminos pendientes): si este
 * navegador ya tiene una suscripcion, la vuelve a registrar para el usuario
 * actual (la reasigna y reactiva), y si se hizo con una clave VAPID vieja se
 * vuelve a suscribir antes. Nunca pide permiso ni crea una suscripcion
 * nueva por su cuenta. Nunca lanza: un 409 (sin consentimiento push), la
 * red o un servidor sin claves solo dejan las cosas como estaban.
 */
export async function reRegistrarPushAlIniciarSesion(
  nav: NavegadorPush = navegadorPush,
  servidor: ServidorPush = servidorEnSegundoPlano,
): Promise<void> {
  try {
    if (!nav.soportado() || nav.permiso() !== 'granted') return;
    if (!(await nav.suscripcionActual())) return;
    const clave = await servidor.clavePublica();
    if (clave === null) return;
    const suscripcion = await suscripcionConClave(nav, clave);
    await servidor.registrar(suscripcion.toJSON(), nav.userAgent());
  } catch {
    // Es una comodidad: el usuario puede activarlo desde su perfil.
  }
}

/**
 * Al cerrar sesion, ANTES de borrar el token (despues daria 401): da de baja
 * este navegador para que deje de recibir los avisos de ese usuario. La
 * suscripcion del navegador se conserva: si el mismo usuario vuelve a
 * entrar, el inicio de sesion la registra otra vez. Nunca lanza y nunca
 * espera mas de `topeMs`: si falla, el cierre sigue.
 */
export async function bajaDePushAlCerrarSesion(
  topeMs: number = TOPE_BAJA_AL_CERRAR_MS,
  nav: NavegadorPush = navegadorPush,
  servidor: ServidorPush = servidorEnSegundoPlano,
): Promise<void> {
  if (!nav.soportado()) return;
  const baja = (async () => {
    const suscripcion = await nav.suscripcionActual();
    if (suscripcion) await servidor.darDeBaja(suscripcion.endpoint);
  })().catch(() => undefined);
  let temporizador: ReturnType<typeof setTimeout> | undefined;
  const tope = new Promise<void>((resolver) => {
    temporizador = setTimeout(resolver, topeMs);
  });
  try {
    await Promise.race([baja, tope]);
  } finally {
    clearTimeout(temporizador);
  }
}

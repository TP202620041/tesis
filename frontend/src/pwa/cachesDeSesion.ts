/**
 * Qué NO debe quedar en las cachés del Service Worker: las respuestas del API.
 *
 * Las respuestas de `/api/**` dependen de quién las pide (`/api/auth/me`,
 * `mis-reportes`, `mi-distrito`, exportaciones). La regla por defecto de
 * Serwist para peticiones a otro origen (`NetworkFirst`, caché
 * `cross-origin`, 10 s de espera) las guardaría, y tras cerrar sesión el
 * siguiente usuario del dispositivo podría recibirlas offline o con red
 * lenta. Lo usan `sw.ts` (regla `NetworkOnly`) y el cierre de sesión
 * (limpieza por si quedó algo de una versión anterior del SW).
 */

/**
 * Caché de `defaultCache` (`@serwist/next/worker`) para peticiones a otro
 * origen: el API en `:8080` y los tiles del mapa.
 */
export const CACHE_ENTRE_ORIGENES = 'cross-origin';

/**
 * `true` si la petición va al API. Se decide por la ruta y no por el origen:
 * todo el backend cuelga de `/api/`, la app Next no tiene rutas `/api/`, y
 * así no hace falta inyectar `NEXT_PUBLIC_API_BASE_URL` en el bundle del SW
 * (lo compila `@serwist/cli` con esbuild, sin las variables de Next).
 */
export function esPeticionAlApi(url: URL): boolean {
  return url.pathname.startsWith('/api/');
}

/**
 * NC-09: página a la que lleva el enlace del correo de confirmación. Llega
 * con `?token=…` en la URL, y la regla por defecto de Serwist para las
 * páginas del mismo origen (`NetworkFirst`, caché `others`) guardaría la
 * respuesta con esa URL, token incluido, como clave en Cache Storage del
 * dispositivo. La página ya saca el token del historial
 * (`history.replaceState`); esto evita que quede en la caché. Repite
 * `RUTA_CONFIRMAR_CUENTA` de `features/auth/model/rutas.ts` porque el SW se
 * compila aparte y no usa el alias `@/`; `cachesDeSesion.test.ts` las compara.
 */
export const RUTA_CON_TOKEN_EN_LA_URL = '/confirmar-cuenta';

/** `true` si la petición es de la página del enlace de confirmación (nunca se cachea). */
export function esPaginaConTokenEnLaUrl(url: URL): boolean {
  return url.pathname === RUTA_CON_TOKEN_EN_LA_URL || url.pathname === `${RUTA_CON_TOKEN_EN_LA_URL}/`;
}

/**
 * Borra la caché entre orígenes. Nunca falla: sin Cache Storage (jsdom,
 * navegador sin soporte, contexto no seguro) no hay nada que borrar.
 */
export async function borrarCacheEntreOrigenes(): Promise<void> {
  if (typeof caches === 'undefined') return;
  try {
    await caches.delete(CACHE_ENTRE_ORIGENES);
  } catch {
    // El cierre de sesión no depende de esto: el token ya se descartó.
  }
}

/**
 * Unico punto del frontend que toca el JWT. Nada mas debe leer ni escribir
 * `localStorage` para la sesion: centralizarlo aqui es lo que hace barata
 * una eventual migracion a cookie `httpOnly` (habria que cambiar este
 * archivo y el login, no todo el codigo que hace requests).
 *
 * ---------------------------------------------------------------------------
 * DECISION DE SEGURIDAD: el token vive en localStorage, no en cookie httpOnly
 * ---------------------------------------------------------------------------
 * Es una decision consciente, con su costo asumido, no el default comodo.
 *
 * Por que localStorage:
 * - El backend emite un bearer token en el cuerpo de la respuesta
 *   (`AuthResponse.token`) y lo espera en el header `Authorization`. Es un
 *   diseno stateless deliberado (ver la decision de US-04 en el README del
 *   backend). Migrar a cookie exigiria cambiar el backend, y como el
 *   frontend corre en otro origen, la cookie tendria que ser
 *   `SameSite=None; Secure` con `Access-Control-Allow-Credentials`, algo
 *   fragil de sostener en desarrollo.
 * - El Service Worker de US-06 reintenta envios en segundo plano. Con bearer
 *   token, el SW adjunta el header explicitamente y controla el reintento;
 *   con cookie dependeria de que el navegador la adjunte en un contexto
 *   cross-origin, que es justo donde las politicas de cookies son mas
 *   restrictivas.
 *
 * Lo que se pierde, dicho sin adornos:
 * - `localStorage` es legible por cualquier script de la pagina. Ante un XSS
 *   (por ejemplo una dependencia de terceros comprometida) el token se puede
 *   exfiltrar y usarse desde fuera del navegador de la victima.
 * - Eso se agrava con la decision de US-04: el backend no tiene blacklist de
 *   tokens, asi que un token robado sigue siendo valido hasta que expira
 *   (120 min), incluso si el usuario cambia su contrasena.
 *
 * Matiz importante para no sobrevender la alternativa: una cookie `httpOnly`
 * NO evita que un XSS abuse de la sesion — el navegador adjunta la cookie
 * igual y el atacante puede hacer requests autenticados desde la pagina. Lo
 * que evita es la *exfiltracion* del token (usarlo desde otra maquina, mas
 * alla de la vida de la pagina). Es una mejora real, pero parcial.
 *
 * Por eso la mitigacion principal aqui ataca la causa, no la consecuencia:
 * una Content-Security-Policy estricta en `next.config.ts` que reduce la
 * probabilidad de que exista XSS. Esa defensa protege a los dos modelos de
 * almacenamiento.
 */

const CLAVE_TOKEN = 'viasegura.token';

/** `true` cuando hay `window` (los Server Components no tienen localStorage). */
function hayNavegador(): boolean {
  return typeof window !== 'undefined';
}

export function guardarToken(token: string): void {
  if (!hayNavegador()) return;
  window.localStorage.setItem(CLAVE_TOKEN, token);
}

export function leerToken(): string | null {
  if (!hayNavegador()) return null;
  return window.localStorage.getItem(CLAVE_TOKEN);
}

export function borrarToken(): void {
  if (!hayNavegador()) return;
  window.localStorage.removeItem(CLAVE_TOKEN);
}

export function haySesion(): boolean {
  return leerToken() !== null;
}

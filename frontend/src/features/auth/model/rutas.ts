import { ROLES, type Rol } from '@/lib/types/domain';

/**
 * Pantalla inicial de cada rol tras iniciar sesion.
 *
 * Ciudadano y funcionario usan la misma aplicacion pero no la misma puerta
 * de entrada: al ciudadano le importan sus reportes y el mapa; al
 * funcionario, la bandeja de su distrito (US-13), que es su herramienta de
 * trabajo.
 */
export function rutaInicialDe(rol: Rol): string {
  switch (rol) {
    case 'FUNCIONARIO_MUNICIPAL':
      return '/bandeja';
    case 'ADMIN':
      // Por ahora el admin solo atiende tickets de soporte (US-25): esa
      // bandeja es su area.
      return RUTA_SOPORTE_ADMIN;
    case 'CIUDADANO':
      // Sus propios reportes, no el mapa publico: quien inicia sesion lo
      // hace para reportar o para ver como van los suyos. El mapa sigue
      // siendo la puerta publica, sin cuenta.
      return '/mis-reportes';
  }
}

/**
 * Bandeja de soporte del ADMIN. Va bajo `/admin/` y no en `/soporte`, que es
 * la pagina de soporte de cualquier usuario: dos grupos de rutas no pueden
 * resolver a la misma URL.
 */
export const RUTA_SOPORTE_ADMIN = '/admin/soporte';

/**
 * NC-07b (D-12): pantalla donde el usuario acepta los terminos vigentes. La
 * misma ruta la usa el cliente HTTP ante el 403 `TERMINOS_PENDIENTES`
 * (`lib/api/client.ts`, `RUTA_ACEPTAR_TERMINOS`); los tests de ambos lados la
 * fijan, porque `lib/` no puede importar de features.
 */
export const RUTA_ACEPTAR_TERMINOS = '/aceptar-terminos';

/** Pagina publica con los terminos de uso y la politica de privacidad. */
export const RUTA_PRIVACIDAD = '/privacidad';

/**
 * Destino de una redireccion que viene en la URL (`?redirect=`), o
 * `porDefecto` si no es una ruta interna. Evita un redirect abierto: solo se
 * aceptan rutas relativas de esta app (`/algo`), nunca `//otro-sitio` ni
 * `https://…`, y nunca la propia pantalla de aceptacion (bucle).
 *
 * Se valida DESPUES de parsear (WHATWG), no sobre el texto: el parser quita
 * tabuladores y saltos de linea y trata `\` como `/`, asi que
 * `"/\t/evil.example"` pasaria un filtro de texto y terminaria siendo
 * `//evil.example`. Se resuelve contra un origen ficticio y solo se acepta si
 * sigue en ese origen.
 */
export function destinoInterno(redirect: string | null | undefined, porDefecto: string): string {
  if (!redirect || !redirect.startsWith('/')) return porDefecto;
  const ruta = rutaDelMismoOrigen(redirect);
  if (ruta === null) return porDefecto;
  // Lo que se devuelve se vuelve a parsear: el `pathname` ya normalizado
  // puede ser otra cosa (`/.//evil.example` → `//evil.example`).
  if (rutaDelMismoOrigen(ruta) !== ruta) return porDefecto;
  if (new URL(ruta, ORIGEN_FICTICIO).pathname === RUTA_ACEPTAR_TERMINOS) return porDefecto;
  return ruta;
}

/**
 * `pathname + search + hash` de `texto` resuelto contra el origen ficticio,
 * o `null` si no es parseable, sale de ese origen o su ruta normalizada
 * empieza con `//` (que, usada como destino, seria una URL de otro sitio).
 */
function rutaDelMismoOrigen(texto: string): string | null {
  let url: URL;
  try {
    url = new URL(texto, ORIGEN_FICTICIO);
  } catch {
    return null;
  }
  if (url.origin !== ORIGEN_FICTICIO || url.pathname.startsWith('//')) return null;
  return url.pathname + url.search + url.hash;
}

/** Origen que no existe, solo para resolver rutas relativas en {@link destinoInterno}. */
const ORIGEN_FICTICIO = 'http://x.invalid';

/** Ruta de la pantalla de aceptacion que, al terminar, vuelve a `destino`. */
export function rutaAceptarTerminos(destino: string): string {
  return `${RUTA_ACEPTAR_TERMINOS}?redirect=${encodeURIComponent(destino)}`;
}

/**
 * A donde ir tras iniciar sesion O registrarse (QA-1 I-2: el registro llevaba
 * a `/sesion`, una pantalla de depuracion). Una sola regla para los dos:
 * vuelve a `?redirect=` si es una ruta interna (p. ej. llego desde `/reportar`
 * sin sesion), si no a la puerta de entrada de su rol; y con los terminos
 * vigentes sin aceptar (NC-07b), antes de nada a la pantalla de aceptacion,
 * que al terminar sigue a ese mismo destino.
 */
export function destinoTrasAcceso(
  usuario: { rol: Rol; debeAceptarTerminos?: boolean },
  redirect: string | null | undefined,
): string {
  const destino = destinoInterno(redirect, rutaInicialDe(usuario.rol));
  return usuario.debeAceptarTerminos ? rutaAceptarTerminos(destino) : destino;
}

/**
 * `ruta` llevando el `?redirect=` recibido, si es una ruta interna valida.
 * Para los enlaces entre login y registro: quien llego al login desde
 * `/reportar` y elige «Regístrate» debe terminar igual en `/reportar`.
 */
export function conRedirect(ruta: string, redirect: string | null | undefined): string {
  const destino = destinoInterno(redirect, '');
  return destino ? `${ruta}?redirect=${encodeURIComponent(destino)}` : ruta;
}

/** Roles que pueden entrar a cada area protegida del cliente. */
export const ROLES_AREA_MUNICIPAL: readonly Rol[] = ['FUNCIONARIO_MUNICIPAL'];
export const ROLES_AREA_ADMIN: readonly Rol[] = ['ADMIN'];
/** Paginas de cualquier usuario autenticado (p. ej. soporte, US-25). */
export const ROLES_CON_SESION: readonly Rol[] = ROLES;

/**
 * `true` si el rol puede ver un area.
 *
 * Es una comodidad de UX, NO la autorizacion: el backend la impone con
 * `@PreAuthorize` y la validacion de jurisdiccion por distrito. Aqui solo se
 * evita que el usuario vea cargar una pantalla que terminara en 403.
 */
export function puedeAcceder(rol: Rol, rolesPermitidos: readonly Rol[]): boolean {
  return rolesPermitidos.includes(rol);
}

/**
 * Texto de "acceso denegado" segun el area que se intento abrir. Se deduce
 * de los roles permitidos para no obligar a cada pagina a repetirlo.
 */
export function descripcionDeArea(rolesPermitidos: readonly Rol[]): string {
  const solo = (rol: Rol) => rolesPermitidos.length === 1 && rolesPermitidos[0] === rol;
  if (solo('FUNCIONARIO_MUNICIPAL')) {
    return 'El área municipal es para funcionarios de una municipalidad distrital.';
  }
  if (solo('ADMIN')) return 'El área de administración es para el equipo de soporte de Ciudad Viva.';
  if (solo('CIUDADANO')) return 'Esta sección es para ciudadanos que reportan daños viales.';
  return 'Esta sección no está disponible para tu tipo de cuenta.';
}

import type { Rol } from '@/lib/types/domain';
import { RUTA_ACEPTAR_TERMINOS, RUTA_SOPORTE_ADMIN, RUTAS_DE_ACCESO } from './rutas';

/**
 * Navegación por rol (DIS-1; propuesta §7, FE-DS-03). Un solo lugar define qué
 * ve cada quien; el marco de la app (`components/MarcoDeLaApp.tsx`) solo lo
 * dibuja. Como `GuardiaDeRol`, es una ayuda de UX: el backend sigue siendo la
 * autoridad de lo que cada rol puede hacer.
 *
 * | Rol         | Móvil (barra inferior)                                  | Escritorio (cabecera)                                       |
 * |-------------|---------------------------------------------------------|-------------------------------------------------------------|
 * | Visitante   | Mapa · Desempeño · Reportar · Entrar                    | Mapa · Desempeño · Iniciar sesión · Crear cuenta            |
 * | Ciudadano   | Mapa · Mis reportes · Reportar · Desempeño · Cuenta     | lo mismo + menú de cuenta (Perfil, Soporte, Apariencia…)    |
 * | Funcionario | Bandeja · Panel · Categorías · Cuenta                   | Municipalidad de X · Bandeja · Panel · Categorías · Soporte |
 * | Admin       | Soporte · Cuenta                                        | Tickets de soporte + menú de cuenta                          |
 *
 * En el móvil, «Cuenta» es una pantalla más ({@link CUENTA}, `/perfil`), con la
 * misma barra y el mismo título grande que las otras; en escritorio es el menú
 * de la cabecera. «Cerrar sesión» vive en los dos, no compite con las acciones.
 */

/** Nombre del icono de cada ítem; el componente lo traduce a Lucide. */
export type IconoNavegacion =
  | 'mapa'
  | 'mis-reportes'
  | 'reportar'
  | 'desempeno'
  | 'bandeja'
  | 'panel'
  | 'categorias'
  | 'soporte'
  | 'perfil'
  | 'cuenta'
  | 'entrar'
  | 'registrarse';

export interface ItemNavegacion {
  href: string;
  etiqueta: string;
  /** Texto más corto para la barra inferior del móvil, si el normal no cabe. */
  etiquetaCorta?: string;
  icono: IconoNavegacion;
  /** La acción principal del rol (Reportar): se dibuja como botón. */
  destacado?: boolean;
  /** Otras rutas en las que este ítem cuenta como el actual (p. ej. el detalle público, para Mapa). */
  tambienEn?: readonly string[];
}

export interface Navegacion {
  /** Enlaces de la cabecera (escritorio). */
  principal: readonly ItemNavegacion[];
  /** Barra inferior del móvil; {@link CUENTA} se agrega aparte cuando hay sesión. */
  inferior: readonly ItemNavegacion[];
  /** Enlaces del menú de cuenta, antes de Apariencia y Cerrar sesión. */
  cuenta: readonly ItemNavegacion[];
  /** Iniciar sesión y crear cuenta (solo el visitante, en la cabecera). */
  acceso: readonly ItemNavegacion[];
}

const MAPA: ItemNavegacion = { href: '/mapa', etiqueta: 'Mapa', icono: 'mapa', tambienEn: ['/reportes'] };
const DESEMPENO: ItemNavegacion = { href: '/desempeno', etiqueta: 'Desempeño', icono: 'desempeno' };
const REPORTAR: ItemNavegacion = { href: '/reportar', etiqueta: 'Reportar', icono: 'reportar', destacado: true };
const MIS_REPORTES: ItemNavegacion = { href: '/mis-reportes', etiqueta: 'Mis reportes', icono: 'mis-reportes' };
const PERFIL: ItemNavegacion = { href: '/perfil', etiqueta: 'Mi perfil', icono: 'perfil' };
const SOPORTE: ItemNavegacion = { href: '/soporte', etiqueta: 'Soporte', icono: 'soporte' };
const BANDEJA: ItemNavegacion = { href: '/bandeja', etiqueta: 'Bandeja', icono: 'bandeja' };
const PANEL: ItemNavegacion = {
  href: '/dashboard',
  etiqueta: 'Panel del distrito',
  etiquetaCorta: 'Panel',
  icono: 'panel',
};
const CATEGORIAS: ItemNavegacion = { href: '/categorias', etiqueta: 'Categorías', icono: 'categorias' };
const INDICE_PUBLICO: ItemNavegacion = { href: '/desempeno', etiqueta: 'Índice público', icono: 'desempeno' };
const SOPORTE_ADMIN: ItemNavegacion = {
  href: RUTA_SOPORTE_ADMIN,
  etiqueta: 'Tickets de soporte',
  etiquetaCorta: 'Soporte',
  icono: 'soporte',
};
const INICIAR_SESION: ItemNavegacion = { href: '/login', etiqueta: 'Iniciar sesión', etiquetaCorta: 'Entrar', icono: 'entrar' };
const CREAR_CUENTA: ItemNavegacion = { href: '/registro', etiqueta: 'Crear cuenta', icono: 'registrarse' };

/**
 * «Cuenta», el último ítem de la barra inferior cuando hay sesión: lleva a
 * `/perfil`, la pantalla de la cuenta de cualquier rol (prueba en iPhone del
 * 23/10: un panel encima no seguía las reglas de las demás pantallas). Sigue
 * marcado en `/soporte`, al que se llega desde ahí.
 */
export const CUENTA: ItemNavegacion = { href: PERFIL.href, etiqueta: 'Cuenta', icono: 'cuenta', tambienEn: [SOPORTE.href] };

/**
 * Navegación de quien mira. `rol` es `null` para el visitante y `'desconocido'`
 * cuando hay sesión pero todavía no se sabe de quién (sin red al abrir la
 * PWA): se ofrece lo público y el menú de cuenta, nada que dependa del rol.
 */
export function navegacionDe(rol: Rol | 'desconocido' | null): Navegacion {
  switch (rol) {
    case null:
      return {
        principal: [MAPA, DESEMPENO],
        // Reportar sin sesión: la guardia de /reportar lleva al login y vuelve.
        inferior: [MAPA, DESEMPENO, REPORTAR, INICIAR_SESION],
        cuenta: [],
        acceso: [INICIAR_SESION, CREAR_CUENTA],
      };
    case 'CIUDADANO':
      return {
        principal: [MAPA, MIS_REPORTES, DESEMPENO, REPORTAR],
        inferior: [MAPA, MIS_REPORTES, REPORTAR, DESEMPENO],
        cuenta: [PERFIL, SOPORTE],
        acceso: [],
      };
    case 'FUNCIONARIO_MUNICIPAL':
      return {
        principal: [BANDEJA, PANEL, CATEGORIAS, SOPORTE],
        inferior: [BANDEJA, PANEL, CATEGORIAS],
        cuenta: [SOPORTE, INDICE_PUBLICO],
        acceso: [],
      };
    case 'ADMIN':
      return { principal: [SOPORTE_ADMIN], inferior: [SOPORTE_ADMIN], cuenta: [], acceso: [] };
    case 'desconocido':
      return { principal: [MAPA, DESEMPENO], inferior: [MAPA, DESEMPENO], cuenta: [], acceso: [] };
  }
}

/** Todos los destinos de la navegación, de cualquier rol. */
const DESTINOS: readonly ItemNavegacion[] = [
  MAPA,
  DESEMPENO,
  REPORTAR,
  MIS_REPORTES,
  PERFIL,
  SOPORTE,
  BANDEJA,
  PANEL,
  CATEGORIAS,
  SOPORTE_ADMIN,
  CUENTA,
];

/**
 * `true` si ir de `anterior` a `nueva` es volver al inicio de un destino desde
 * algo que cuelga de él (de `/soporte` a «Cuenta», del detalle a «Mis
 * reportes»): como en las pestañas de iOS, se vuelve a donde se estaba, no
 * arriba. Ir a otro destino, o tocar el que ya está abierto, no lo es.
 */
export function esRegresoDentroDeSuDestino(anterior: string, nueva: string): boolean {
  const camino = (ruta: string) => ruta.split(/[?#]/)[0] ?? ruta;
  if (camino(anterior) === camino(nueva)) return false;
  return DESTINOS.some((item) => item.href === camino(nueva) && esRutaActual(anterior, item));
}

/**
 * Lo que la pantalla de la cuenta (`/perfil`) ofrece al final, junto a
 * «Cerrar sesión»: los enlaces de la cuenta del rol, menos ella misma.
 */
export function enlacesDeLaPantallaDeCuenta(rol: Rol): readonly ItemNavegacion[] {
  return navegacionDe(rol).cuenta.filter((item) => item.href !== PERFIL.href);
}

/**
 * `true` si `ruta` es la del ítem o cuelga de ella (`/mis-reportes/12` es
 * «Mis reportes»). Compara por segmentos: `/mapa-x` no es `/mapa`.
 */
export function esRutaActual(ruta: string, item: ItemNavegacion): boolean {
  const camino = ruta.split(/[?#]/)[0] ?? ruta;
  return [item.href, ...(item.tambienEn ?? [])].some(
    (base) => camino === base || camino.startsWith(`${base}/`),
  );
}

/**
 * Cuánto marco lleva cada pantalla:
 * - `ninguno`: las de acceso (login, registro, recuperación y confirmación
 *   del correo, {@link RUTAS_DE_ACCESO}), que tienen su propio marco centrado
 *   con el logo: quien llega ahí viene a una sola cosa.
 * - `minimo`: la aceptación de términos (solo el logo): mientras no acepte, el
 *   resto de la app le respondería 403.
 * - `completo`: todas las demás.
 */
export type ModoDelMarco = 'ninguno' | 'minimo' | 'completo';

export function modoDelMarco(ruta: string): ModoDelMarco {
  const camino = ruta.split(/[?#]/)[0] ?? ruta;
  const es = (base: string) => camino === base || camino.startsWith(`${base}/`);
  if (RUTAS_DE_ACCESO.some(es)) return 'ninguno';
  if (es(RUTA_ACEPTAR_TERMINOS)) return 'minimo';
  return 'completo';
}

/** «AV» para Ana Vecina; lo que lleva el avatar del menú de cuenta. */
export function iniciales(nombre: string | null | undefined, apellido: string | null | undefined): string {
  const letra = (texto: string | null | undefined) => (texto?.trim()[0] ?? '').toLocaleUpperCase('es-PE');
  return `${letra(nombre)}${letra(apellido)}` || '?';
}

/** Cómo se presenta el rol en el menú de cuenta. */
export function descripcionDeCuenta(usuario: {
  rol: Rol;
  distritoNombre?: string | null;
}): string {
  switch (usuario.rol) {
    case 'CIUDADANO':
      return 'Ciudadano';
    case 'FUNCIONARIO_MUNICIPAL':
      return usuario.distritoNombre ? `Municipalidad de ${usuario.distritoNombre}` : 'Funcionario municipal';
    case 'ADMIN':
      return 'Equipo de soporte de Ciudad Viva';
  }
}

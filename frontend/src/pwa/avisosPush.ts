/**
 * US-21: reglas puras del Service Worker para los avisos push.
 *
 * Separadas de `sw.ts` para probarlas en jsdom: leer el payload que manda el
 * backend (handoff `2026-10-19-push-real.md`), decidir que URL abrir y que
 * ventana reutilizar al hacer clic.
 */

/** Notificacion lista para `showNotification`. */
export interface AvisoPush {
  titulo: string;
  cuerpo: string;
  /** Ruta de esta app a abrir al hacer clic (siempre del mismo origen). */
  url: string;
  /** `reporte-<id>`: un aviso nuevo del mismo reporte reemplaza al anterior. */
  tag: string | undefined;
}

/** Lo que se muestra si el payload no se puede leer (con `userVisibleOnly` hay que mostrar algo). */
export const AVISO_GENERICO: AvisoPush = {
  titulo: 'Ciudad Viva',
  cuerpo: 'Hay novedades en tus reportes.',
  url: '/mis-reportes',
  tag: undefined,
};

function texto(valor: unknown): string | null {
  return typeof valor === 'string' && valor.trim() !== '' ? valor : null;
}

/** Origen que no existe, solo para resolver rutas relativas en {@link rutaInterna}. */
const ORIGEN_FICTICIO = 'http://x.invalid';

/**
 * Ruta interna a abrir: solo una ruta relativa de esta app (`/algo`). Una
 * URL absoluta, `//otro-sitio` o algo que no sea texto cae a «mis
 * reportes»: una notificacion no debe poder llevar a otro origen.
 *
 * Se valida DESPUES de parsear (WHATWG quita `\t`, `\n` y `\r` y trata `\`
 * como `/`: `"/\t/otro"` seria `//otro`), contra un origen ficticio.
 */
export function rutaInterna(url: unknown): string {
  const ruta = texto(url);
  if (!ruta || !ruta.startsWith('/')) return AVISO_GENERICO.url;
  const normalizada = rutaDelMismoOrigen(ruta);
  // Lo que se devuelve se vuelve a parsear: la normalizacion de puntos puede
  // cambiarla (`/.//otro` → `//otro`).
  if (normalizada === null || rutaDelMismoOrigen(normalizada) !== normalizada) {
    return AVISO_GENERICO.url;
  }
  return normalizada;
}

/**
 * `pathname + search + hash` resuelto contra el origen ficticio, o `null`
 * si no es parseable, sale de ese origen o la ruta normalizada empieza con
 * `//` (como destino seria otro sitio).
 */
function rutaDelMismoOrigen(ruta: string): string | null {
  let parseada: URL;
  try {
    parseada = new URL(ruta, ORIGEN_FICTICIO);
  } catch {
    return null;
  }
  if (parseada.origin !== ORIGEN_FICTICIO || parseada.pathname.startsWith('//')) return null;
  return parseada.pathname + parseada.search + parseada.hash;
}

/**
 * Payload del backend (`{ titulo, cuerpo, url, reporteId, estado }`) a
 * notificacion. Tolerante: si falta algo usa el texto generico; nunca
 * lanza, porque un `push` sin notificacion visible lo castiga el navegador.
 */
export function leerAvisoPush(datos: unknown): AvisoPush {
  if (typeof datos !== 'object' || datos === null) return AVISO_GENERICO;
  const d = datos as Record<string, unknown>;
  const reporteId = typeof d.reporteId === 'number' && Number.isFinite(d.reporteId) ? d.reporteId : null;
  return {
    titulo: texto(d.titulo) ?? AVISO_GENERICO.titulo,
    cuerpo: texto(d.cuerpo) ?? AVISO_GENERICO.cuerpo,
    url: rutaInterna(d.url),
    tag: reporteId !== null ? `reporte-${reporteId}` : undefined,
  };
}

/** Que hacer al hacer clic en la notificacion. */
export type AccionDeClic =
  | { tipo: 'enfocar'; indice: number }
  | { tipo: 'navegar'; indice: number }
  | { tipo: 'abrir' };

/**
 * Elige la ventana para la URL `destino` (absoluta) entre las abiertas de
 * esta app: la que ya esta en esa URL se enfoca; si no, se reutiliza la
 * primera ventana de la app (enfocar + navegar); si no hay ninguna, se abre
 * una nueva. Solo cuenta ventanas del mismo origen que `destino`.
 */
export function elegirVentana(ventanas: ReadonlyArray<{ url: string }>, destino: string): AccionDeClic {
  const objetivo = new URL(destino);
  const delOrigen = ventanas
    .map((v, indice) => ({ url: new URL(v.url), indice }))
    .filter((v) => v.url.origin === objetivo.origin);
  const exacta = delOrigen.find((v) => v.url.href === objetivo.href);
  if (exacta) return { tipo: 'enfocar', indice: exacta.indice };
  const primera = delOrigen[0];
  if (primera) return { tipo: 'navegar', indice: primera.indice };
  return { tipo: 'abrir' };
}

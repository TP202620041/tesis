/**
 * NC-08 / NC-08b: verificación «No soy un robot» del registro con
 * Cloudflare Turnstile (reemplazó a reCAPTCHA v2 el 28/10).
 *
 * Lógica pura: qué site key se usa, si el captcha está activo, de dónde se
 * baja el script y qué tamaño de widget cabe. Cargar el script y pintar el
 * widget (I/O sobre `document` y `window`) lo hace `hooks/useCaptcha.ts`.
 *
 * La site key es pública (Cloudflare la pone en el HTML de cualquier página
 * con el widget); la clave secreta vive solo en el backend.
 */

/**
 * Site key de Turnstile, o `null` si no está configurada (vacía cuenta como
 * ausente). Se lee con el nombre literal `process.env.NEXT_PUBLIC_…` porque
 * Next solo hornea en el bundle las lecturas literales, no las dinámicas. En
 * Vercel es obligatoria (lo exige `next.config.ts`); en local puede faltar:
 * el backend local corre con `CAPTCHA_TIPO=ninguno`.
 */
export function siteKeyDelCaptcha(): string | null {
  return process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim() || null;
}

/** `true` si el registro debe mostrar el widget y exigir su token. */
export function captchaConfigurado(): boolean {
  return siteKeyDelCaptcha() !== null;
}

/**
 * Origen de Turnstile: el script, el iframe del widget y lo que este pide.
 * La CSP de `next.config.ts` y el Service Worker (`src/pwa/cachesDeSesion.ts`)
 * lo repiten porque se arman fuera del bundle; sus tests lo comparan con este.
 */
export const ORIGEN_DEL_CAPTCHA = 'https://challenges.cloudflare.com';

/**
 * Script de Turnstile, en la URL EXACTA que publica Cloudflare (avisa que
 * copiarlo, fijarlo o servirlo desde una caché rompe el widget cuando lo
 * actualizan). `render=explicit`: el widget se pinta cuando lo pide el hook
 * (con `turnstile.render`), no buscando `.cf-turnstile` en el DOM al cargar,
 * que no encaja con un componente React. El idioma va en los parámetros del
 * widget ({@link IDIOMA_DEL_WIDGET}), no en la URL.
 */
export const URL_SCRIPT_CAPTCHA = `${ORIGEN_DEL_CAPTCHA}/turnstile/v0/api.js?render=explicit`;

/**
 * Textos del widget en español. En español Turnstile solo admite `es` y
 * `es-es` (no hay `es-419` ni `es-pe`); `es` es el neutro. Con un código no
 * admitido cae al inglés (guía de Cloudflare, «Widget configurations»).
 */
export const IDIOMA_DEL_WIDGET = 'es';

/** Error en línea al enviar sin haber completado la verificación. */
export const MENSAJE_FALTA_CAPTCHA = 'Completa la verificación «No soy un robot» antes de crear la cuenta.';

/** Texto cuando el script de Cloudflare no carga (sin red, bloqueado). */
export const MENSAJE_CAPTCHA_SIN_CARGAR = 'No se pudo cargar la verificación. Revisa tu conexión y recarga.';

/** Ancho fijo del widget `normal` de Turnstile, en px (mide 300 × 65). */
export const ANCHO_WIDGET_NORMAL = 300;

export type TamanoDelWidget = 'normal' | 'compact';

/**
 * Tamaño del widget según el ancho disponible en su contenedor. El `normal`
 * mide 300 × 65 px y no se adapta: en un teléfono angosto (o con zoom de
 * texto) desbordaría el formulario. El `compact` (150 × 140 px) cabe en
 * cualquier pantalla. Un ancho desconocido (0) se trata como angosto.
 */
export function tamanoDelWidget(anchoDisponible: number): TamanoDelWidget {
  return anchoDisponible >= ANCHO_WIDGET_NORMAL ? 'normal' : 'compact';
}

/**
 * Parámetros de `turnstile.render` que usa la app (solo esos: Turnstile
 * acepta más).
 *
 * - `expired-callback`: el token vence a los 300 s. Turnstile renueva solo
 *   el widget (`refresh-expired: auto`, el valor por defecto) y vuelve a
 *   llamar a `callback` con uno nuevo.
 * - `error-callback`: recibe el código de error. Devolver algo falso deja que
 *   Turnstile lo anote en la consola y reintente solo (`retry: auto`).
 * - `response-field: false`: sin el `<input hidden>` que Turnstile agrega por
 *   defecto dentro del formulario; el token viaja por `callback`.
 */
export interface ParametrosDelWidget {
  sitekey: string;
  size: TamanoDelWidget;
  language: string;
  'response-field': boolean;
  callback: (token: string) => void;
  'expired-callback': () => void;
  'error-callback': (codigo?: string) => void;
}

/** Miembros de `window.turnstile` que usa la app. `render` devuelve el id del widget. */
export interface ApiDeTurnstile {
  render: (contenedor: HTMLElement, parametros: ParametrosDelWidget) => string | null | undefined;
  reset: (idDelWidget: string) => void;
  remove: (idDelWidget: string) => void;
}

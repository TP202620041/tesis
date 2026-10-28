/**
 * NC-08: reCAPTCHA v2 («No soy un robot») en el registro.
 *
 * Lógica pura: qué site key se usa, si el captcha está activo, de dónde se
 * baja el script y qué tamaño de widget cabe. Cargar el script y pintar el
 * widget (I/O sobre `document` y `window`) lo hace `hooks/useCaptcha.ts`.
 *
 * La site key es pública (Google la pone en el HTML de cualquier página con
 * captcha); la clave secreta vive solo en el backend.
 */

/**
 * Site key de reCAPTCHA v2, o `null` si no está configurada (vacía cuenta
 * como ausente). Se lee con el nombre literal `process.env.NEXT_PUBLIC_…`
 * porque Next solo hornea en el bundle las lecturas literales, no las
 * dinámicas. En Vercel es obligatoria (lo exige `next.config.ts`); en local
 * puede faltar: el backend local corre con `CAPTCHA_TIPO=ninguno`.
 */
export function siteKeyDelCaptcha(): string | null {
  return process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY?.trim() || null;
}

/** `true` si el registro debe mostrar el widget y exigir su token. */
export function captchaConfigurado(): boolean {
  return siteKeyDelCaptcha() !== null;
}

/**
 * Script de reCAPTCHA. `render=explicit`: el widget se pinta cuando lo pide
 * el hook (con `grecaptcha.render`), no buscando `.g-recaptcha` en el DOM al
 * cargar, que no encaja con un componente React. `hl=es`: textos en español.
 */
export const URL_SCRIPT_CAPTCHA = 'https://www.google.com/recaptcha/api.js?render=explicit&hl=es';

/** Error en línea al enviar sin haber resuelto la casilla. */
export const MENSAJE_FALTA_CAPTCHA = 'Confirma que no eres un robot marcando la casilla de verificación.';

/** Texto cuando el script de Google no carga (sin red, bloqueado). */
export const MENSAJE_CAPTCHA_SIN_CARGAR = 'No se pudo cargar la verificación. Revisa tu conexión y recarga.';

/** Ancho fijo del widget `normal` de reCAPTCHA v2, en px. */
export const ANCHO_WIDGET_NORMAL = 304;

export type TamanoDelWidget = 'normal' | 'compact';

/**
 * Tamaño del widget según el ancho disponible en su contenedor. El `normal`
 * mide 304 × 78 px y no se adapta: en un teléfono angosto (o con zoom de
 * texto) desbordaría el formulario. El `compact` (164 × 144 px) cabe en
 * cualquier pantalla. Un ancho desconocido (0) se trata como angosto.
 */
export function tamanoDelWidget(anchoDisponible: number): TamanoDelWidget {
  return anchoDisponible >= ANCHO_WIDGET_NORMAL ? 'normal' : 'compact';
}

/**
 * Parámetros de `grecaptcha.render` que usa la app (solo esos: el tipado
 * completo de Google tiene más).
 */
export interface ParametrosDelWidget {
  sitekey: string;
  size: TamanoDelWidget;
  callback: (token: string) => void;
  'expired-callback': () => void;
  'error-callback': () => void;
}

/** Miembros de `window.grecaptcha` que usa la app. */
export interface ApiDeReCaptcha {
  ready: (alListo: () => void) => void;
  render: (contenedor: HTMLElement, parametros: ParametrosDelWidget) => number;
  reset: (idDelWidget?: number) => void;
}

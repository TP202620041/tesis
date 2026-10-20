/**
 * US-21: reglas puras de la suscripcion Web Push de este navegador.
 *
 * Sin `window`, sin `navigator`: lo que toca el navegador vive en
 * `src/pwa/push.ts` y la orquestacion en `hooks/push.ts`.
 */

/**
 * Estado de push en ESTE navegador, para el perfil.
 *
 * - `no-soportado`: el navegador no tiene Service Worker, PushManager o
 *   Notification (o la app corre sin Service Worker, como en `next dev`).
 * - `sin-claves`: el servidor no tiene claves VAPID (`GET
 *   /api/notificaciones/vapid-public-key` da 404): no se ofrece push.
 * - `denegado`: el usuario bloqueo las notificaciones para este sitio; solo
 *   se puede revertir desde la configuracion del navegador.
 * - `inactivo`: se puede activar.
 * - `activo`: este navegador tiene una suscripcion.
 */
export type EstadoPush = 'no-soportado' | 'sin-claves' | 'denegado' | 'inactivo' | 'activo';

/**
 * Clave publica VAPID (base64url, sin relleno, como la entrega el backend)
 * a bytes, para `pushManager.subscribe({ applicationServerKey })`.
 */
export function base64UrlABytes(base64Url: string): Uint8Array<ArrayBuffer> {
  const relleno = '='.repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + relleno).replace(/-/g, '+').replace(/_/g, '/');
  const binario = atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(binario.length));
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
  return bytes;
}

/**
 * `true` si la suscripcion del navegador se hizo con la clave `actual`.
 *
 * Tras rotar las claves VAPID en el servidor, el servicio de push rechaza
 * (401/403) los envios a las suscripciones viejas y el backend no las
 * desactiva por eso (handoff `2026-10-19-push-real.md`): el frontend debe
 * detectarlo y volver a suscribirse. Si el navegador no informa la clave
 * (`null`), no se puede saber: se trata como distinta y se vuelve a
 * suscribir, que es lo seguro (solo cuesta un endpoint nuevo).
 */
export function esLaMismaClave(
  claveDeLaSuscripcion: ArrayBuffer | null | undefined,
  actual: Uint8Array,
): boolean {
  if (!claveDeLaSuscripcion) return false;
  const previa = new Uint8Array(claveDeLaSuscripcion);
  if (previa.length !== actual.length) return false;
  return previa.every((byte, i) => byte === actual[i]);
}

/** Texto del estado de push para el perfil. */
export function textoDeEstadoPush(estado: EstadoPush): string {
  switch (estado) {
    case 'no-soportado':
      return 'Este navegador no admite notificaciones push (o la aplicación no está instalada como PWA en este modo).';
    case 'sin-claves':
      return 'Las notificaciones push no están disponibles por ahora en el servidor.';
    case 'denegado':
      return 'Bloqueaste las notificaciones de este sitio. Para activarlas, permítelas en la configuración del navegador.';
    case 'inactivo':
      return 'Las notificaciones push no están activas en este navegador.';
    case 'activo':
      return 'Las notificaciones push están activas en este navegador.';
  }
}

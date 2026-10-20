/**
 * US-21: adaptador de las APIs de push del navegador (Service Worker,
 * PushManager, Notification).
 *
 * Solo traduce llamadas del navegador; las decisiones (cuando suscribir, que
 * hacer con una clave rotada, que avisar al servidor) estan en
 * `features/auth/hooks/push.ts`, que recibe este adaptador por parametro y
 * por eso se prueba con dobles.
 */

/** Lo que la orquestacion necesita del navegador. */
export interface NavegadorPush {
  /** `true` si hay Service Worker, PushManager y Notification. */
  soportado(): boolean;
  permiso(): NotificationPermission;
  pedirPermiso(): Promise<NotificationPermission>;
  /** Suscripcion actual de este navegador, sin esperar a un SW que no existe. */
  suscripcionActual(): Promise<PushSubscription | null>;
  /** Suscribe con la clave VAPID; falla si no hay Service Worker activo. */
  suscribir(claveServidor: Uint8Array<ArrayBuffer>): Promise<PushSubscription>;
  /** `navigator.userAgent`, que el backend guarda para que el usuario reconozca el navegador. */
  userAgent(): string;
}

/** Tiempo maximo esperando a que el Service Worker quede activo al suscribir. */
const ESPERA_SERVICE_WORKER_MS = 10_000;

/** No hay Service Worker activo (p. ej. `next dev`, donde esta desactivado). */
export class SinServiceWorkerError extends Error {
  constructor() {
    super('No hay un Service Worker activo para recibir notificaciones.');
    this.name = 'SinServiceWorkerError';
  }
}

async function registroActivo(): Promise<ServiceWorkerRegistration> {
  let temporizador: ReturnType<typeof setTimeout> | undefined;
  const tope = new Promise<never>((_, rechazar) => {
    temporizador = setTimeout(() => rechazar(new SinServiceWorkerError()), ESPERA_SERVICE_WORKER_MS);
  });
  try {
    // `ready` nunca resuelve si no hay SW registrado: por eso el tope.
    return await Promise.race([navigator.serviceWorker.ready, tope]);
  } finally {
    clearTimeout(temporizador);
  }
}

export const navegadorPush: NavegadorPush = {
  soportado() {
    return (
      typeof window !== 'undefined' &&
      'serviceWorker' in navigator &&
      'PushManager' in window &&
      'Notification' in window
    );
  },
  permiso() {
    return Notification.permission;
  },
  pedirPermiso() {
    return Notification.requestPermission();
  },
  async suscripcionActual() {
    // `getRegistration` (y no `ready`) para no quedarse esperando sin SW.
    const registro = await navigator.serviceWorker.getRegistration();
    return (await registro?.pushManager.getSubscription()) ?? null;
  },
  async suscribir(claveServidor) {
    const registro = await registroActivo();
    return registro.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: claveServidor });
  },
  userAgent() {
    return navigator.userAgent;
  },
};

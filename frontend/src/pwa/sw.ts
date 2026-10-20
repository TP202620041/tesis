/// <reference lib="webworker" />

import { defaultCache } from '@serwist/next/worker';
import type { PrecacheEntry, SerwistGlobalConfig } from 'serwist';
import { NetworkOnly, Serwist } from 'serwist';
import { AVISO_GENERICO, elegirVentana, leerAvisoPush, rutaInterna } from './avisosPush';
import { esPeticionAlApi } from './cachesDeSesion';

/**
 * Service Worker de la PWA.
 *
 * Modulo AISLADO a proposito (requisito de 03_scaffolding): nada del resto de
 * la aplicacion importa de aqui, y este archivo no importa componentes ni
 * hooks. Corre en otro hilo, sin DOM, con su propio ciclo de vida.
 *
 * Alcance actual: precache del App Shell y caching en runtime por defecto de
 * Serwist, salvo el API, que nunca se cachea. Es lo que permite que la
 * aplicacion abra sin conexion. Ademas, los avisos push de US-21 (`push` y
 * `notificationclick`, con la logica pura en `avisosPush.ts`).
 *
 * US-06 (cola de reportes creados sin conexion) NO vive aqui, a proposito:
 * la cola esta en IndexedDB (`colaReportes.ts`) y la reenvia la pagina con el
 * token vigente. Un `BackgroundSyncPlugin` guardaria la peticion con su
 * `Authorization` original y la repetiria tal cual, aunque el token haya
 * vencido; y el SW no puede leer el token nuevo (vive en `localStorage`, que
 * solo toca `lib/auth/token-storage.ts`). Ver "Cola offline" en el README.
 */

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  // La primera regla que coincide gana: el API va siempre a la red y nunca
  // se guarda (ver `cachesDeSesion.ts`), antes de que la regla `cross-origin`
  // de `defaultCache` lo cachee.
  runtimeCaching: [
    { matcher: ({ url }) => esPeticionAlApi(url), handler: new NetworkOnly() },
    ...defaultCache,
  ],
});

serwist.addEventListeners();

/*
 * US-21: avisos push. El backend envia (cifrado, via el servicio de push del
 * navegador) `{ titulo, cuerpo, url, reporteId, estado }`. El SW no llama a
 * ningun origen externo ni al API: solo muestra la notificacion y, al hacer
 * clic, enfoca o abre una pagina de esta misma app.
 */
self.addEventListener('push', (event) => {
  let datos: unknown = null;
  try {
    datos = event.data?.json();
  } catch {
    // Payload que no es JSON: se muestra el aviso generico.
  }
  const aviso = leerAvisoPush(datos);
  // `userVisibleOnly: true` obliga a mostrar una notificacion por cada push.
  event.waitUntil(
    self.registration.showNotification(aviso.titulo, {
      body: aviso.cuerpo,
      tag: aviso.tag,
      data: { url: aviso.url },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const datos: unknown = event.notification.data;
  const url = rutaInterna(typeof datos === 'object' && datos !== null ? (datos as { url?: unknown }).url : null);
  const resuelta = new URL(url, self.location.origin);
  // Segunda barrera, ya con el origen real: nunca se abre ni se navega fuera
  // de esta app aunque `rutaInterna` dejara pasar algo; en ese caso se abre
  // la ruta generica de la app.
  const destino =
    resuelta.origin === self.location.origin
      ? resuelta.href
      : new URL(AVISO_GENERICO.url, self.location.origin).href;
  event.waitUntil(
    (async () => {
      const ventanas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const accion = elegirVentana(ventanas, destino);
      if (accion.tipo === 'abrir') {
        await self.clients.openWindow(destino);
        return;
      }
      const ventana = ventanas[accion.indice];
      if (!ventana) return;
      const enfocada = await ventana.focus();
      if (accion.tipo === 'navegar') {
        // `navigate` solo funciona en ventanas que este SW controla; si no,
        // se abre una nueva con la URL del aviso.
        const navegada = await enfocada.navigate(destino).catch(() => null);
        if (!navegada) await self.clients.openWindow(destino);
      }
    })(),
  );
});

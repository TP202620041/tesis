/// <reference lib="webworker" />

import { defaultCache } from '@serwist/next/worker';
import type { PrecacheEntry, SerwistGlobalConfig } from 'serwist';
import { NetworkOnly, Serwist } from 'serwist';
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
 * aplicacion abra sin conexion.
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

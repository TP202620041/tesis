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
 * PENDIENTE (US-06, slice propio): la cola de sincronizacion de reportes
 * creados offline. El plan es un `BackgroundSyncPlugin` de Workbox sobre
 * `POST /api/reportes`, reenviando cada reporte encolado al recuperar senal.
 * El backend ya esta preparado: acepta el header `Idempotency-Key`, asi que
 * un reintento del mismo reporte devuelve la respuesta original en vez de
 * duplicarlo o fallar con el 409 de acumulacion de US-09.
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

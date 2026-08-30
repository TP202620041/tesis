import { serwist } from '@serwist/next/config';

/**
 * Construccion del Service Worker (Serwist en "modo configurador").
 *
 * POR QUE ESTE MODO Y NO EL PLUGIN `withSerwistInit`:
 * el plugin de Next inyecta configuracion de **webpack**, y desde Next.js 16
 * el bundler por defecto es **Turbopack**. Combinarlos hace fallar el build
 * ("This build is using Turbopack, with a `webpack` config"). Las salidas
 * eran: (a) forzar `next build --webpack`, renunciando al bundler por
 * defecto del framework, o (b) este modo, en el que el Service Worker se
 * compila como un paso aparte con `@serwist/cli` y `next.config.ts` queda
 * limpio. Se eligio (b): Turbopack sigue siendo el bundler de la aplicacion
 * y el SW deja de depender del pipeline de bundling de Next.
 *
 * Se ejecuta despues de `next build` (ver el script `build` en package.json),
 * porque necesita el `.next/` ya generado para precachear el App Shell.
 */
export default serwist({
  swSrc: 'src/pwa/sw.ts',
  swDest: 'public/sw.js',
  globDirectory: '.next',
  // Reportar cada archivo precacheado ensucia la salida del build sin aportar.
  disablePrecacheManifest: false,
});

/**
 * Reglas de capas del frontend (ver ARCHITECTURE.md, sección 5).
 *
 * Cada bloque aplica `no-restricted-imports` a UNA capa. Los globs de `files`
 * no se solapan a propósito: en flat config, si dos bloques configuran la
 * misma regla para el mismo archivo, gana el último y el primero se pierde
 * en silencio.
 *
 * Convención que estas reglas hacen cumplir: dentro de una feature se
 * importa en RELATIVO (`../api`, `../model/tipos`); el alias
 * `@/features/<x>/...` queda para lo que viene de OTRA feature, y de otra
 * feature solo se puede tomar su `model/`. Por eso basta con prohibir
 * `@/features/* /api|hooks|components` para bloquear el acoplamiento entre
 * features sin tener que nombrar cada una.
 *
 * Severidad: `SEVERIDAD` arranca en 'warn' durante la migración (FE-01..FE-08
 * del plan) para no romper `npm run lint`. La tarea FE-09 la cambia a 'error'.
 */

const SEVERIDAD = 'warn';

const SIN_TESTS = ['**/*.test.ts', '**/*.test.tsx'];

const MSG = {
  gatewayDesdeUi:
    'Capa de presentación: no llames al API. Usa un hook de la feature (features/<x>/hooks).',
  clienteHttp:
    'Solo features/<x>/api.ts usa el cliente HTTP. Los errores se traducen en el hook; las URLs de fotos las resuelve api.ts.',
  token: 'El token solo lo toca lib/auth/token-storage.ts, vía los hooks de auth.',
  schema:
    'Los tipos generados solo se importan en features/<x>/model, features/<x>/api.ts o lib/types. Importa el tipo desde model.',
  otraFeature:
    'De otra feature solo se importa su model/. Dentro de la propia feature, importa en relativo.',
  modelPuro:
    'model/ es dominio puro: sin React, sin Next, sin I/O, sin hooks ni componentes.',
  haciaFeatures: 'lib/, components/, map/ y pwa/ son compartidos: no dependen de features ni de app.',
  hookSinUi: 'Un hook (capa de aplicación) no importa componentes.',
};

const p = (group, message) => ({ group, message });

const comunes = {
  schema: p(['@/lib/api/generated/**'], MSG.schema),
  token: p(['@/lib/auth/**'], MSG.token),
  otraFeatureApi: p(['@/features/*/api', '@/features/*/api.ts'], MSG.otraFeature),
  otraFeatureInterna: p(
    ['@/features/*/hooks', '@/features/*/hooks/**', '@/features/*/components', '@/features/*/components/**'],
    MSG.otraFeature,
  ),
};

const capa = (nombre, files, patterns) => ({
  name: `capas/${nombre}`,
  files,
  ignores: SIN_TESTS,
  rules: { 'no-restricted-imports': [SEVERIDAD, { patterns }] },
});

export const reglasDeCapas = [
  // Presentación (rutas): compone; no hace I/O.
  capa('app', ['src/app/**/*.{ts,tsx}'], [
    p(['@/features/*/api', '@/features/*/api.ts'], MSG.gatewayDesdeUi),
    p(['@/lib/api/**'], MSG.clienteHttp),
    comunes.token,
    comunes.schema,
  ]),

  // Presentación de la feature.
  capa('feature-components', ['src/features/*/components/**/*.{ts,tsx}'], [
    p(['**/api', '**/api.ts'], MSG.gatewayDesdeUi),
    p(['@/lib/api/**'], MSG.clienteHttp),
    comunes.token,
    comunes.schema,
    comunes.otraFeatureApi,
    comunes.otraFeatureInterna,
  ]),

  // Aplicación: orquesta api + estado. No conoce la UI ni los tipos generados.
  capa('feature-hooks', ['src/features/*/hooks/**/*.{ts,tsx}'], [
    p(['**/components', '**/components/**'], MSG.hookSinUi),
    comunes.schema,
    comunes.otraFeatureApi,
    comunes.otraFeatureInterna,
  ]),

  // Dominio: tipos y reglas puras.
  capa('feature-model', ['src/features/*/model/**/*.{ts,tsx}'], [
    p(['react', 'react-dom', 'react/*', 'next', 'next/*', 'leaflet', 'react-leaflet'], MSG.modelPuro),
    p(['../api', '../../api', '**/api.ts', '@/features/*/api', '**/hooks', '**/hooks/**', '**/components', '**/components/**'], MSG.modelPuro),
    p(['@/lib/api/client', '@/lib/api/errors'], MSG.modelPuro),
    comunes.token,
  ]),

  // Infraestructura de la feature: gateway HTTP.
  capa('feature-api', ['src/features/*/api.ts'], [
    p(['react', 'react-dom', 'react/*', 'next/*'], MSG.modelPuro),
    p(['./hooks', './hooks/**', './components', './components/**'], MSG.modelPuro),
    comunes.otraFeatureApi,
    comunes.otraFeatureInterna,
  ]),

  // Compartidos: no dependen de features ni de rutas.
  capa('compartidos', ['src/lib/**/*.{ts,tsx}', 'src/components/**/*.{ts,tsx}'], [
    p(['@/features/**', '@/app/**'], MSG.haciaFeatures),
  ]),

  // Adaptadores de librerías (Leaflet, Serwist): pueden usar model y lib.
  capa('adaptadores', ['src/map/**/*.{ts,tsx}', 'src/pwa/**/*.{ts,tsx}'], [
    p(['@/app/**'], MSG.haciaFeatures),
    comunes.otraFeatureApi,
    comunes.otraFeatureInterna,
    comunes.schema,
  ]),
];

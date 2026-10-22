import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import manifest from './manifest';

/**
 * `public/` del frontend, relativo a este archivo. No se usa
 * `new URL('…', import.meta.url)`: Vite reescribe ese patron (ver
 * `features/auth/model/terminos.test.ts`).
 */
const PUBLIC = resolve(dirname(fileURLToPath(import.meta.url)), '../../public');

/**
 * DEP-06: el manifest declaro durante semanas iconos que no existian y Chrome
 * no ofrecia instalar la PWA, sin ningun error en la build ni en los tests.
 */
describe('manifest', () => {
  const iconos = manifest().icons ?? [];

  it.each(iconos.map((icono) => icono.src))('%s existe en public/', (src) => {
    const archivo = resolve(PUBLIC, `.${src}`);
    expect(existsSync(archivo), `no se encontro ${archivo}`).toBe(true);
  });

  // `any` de 192 y 512 los exige Chrome para instalar; los `maskable`, para
  // que Android no encoja el icono `any` dentro de un circulo blanco.
  it.each(['any', 'maskable'])('declara iconos %s de 192 y 512 px', (proposito) => {
    const tamanos = iconos.filter((icono) => icono.purpose === proposito).map((icono) => icono.sizes);
    expect(tamanos).toEqual(expect.arrayContaining(['192x192', '512x512']));
  });
});

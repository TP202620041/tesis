import { existsSync, readFileSync } from 'node:fs';
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

const FIRMA_PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** `AnchoxAlto` de un PNG, leido del encabezado IHDR (bytes 16-23, big-endian). */
function medidasPng(archivo: string): string {
  const bytes = readFileSync(archivo);
  expect([...bytes.subarray(0, 8)], `${archivo} no es un PNG`).toEqual(FIRMA_PNG);
  expect(bytes.toString('latin1', 12, 16)).toBe('IHDR');
  return `${bytes.readUInt32BE(16)}x${bytes.readUInt32BE(20)}`;
}

/**
 * DEP-06: el manifest declaro durante semanas iconos que no existian y Chrome
 * no ofrecia instalar la PWA, sin ningun error en la build ni en los tests.
 */
describe('manifest', () => {
  const iconos = manifest().icons ?? [];

  it.each(iconos.map((icono) => [icono.src, icono.sizes, icono.type]))(
    '%s existe en public/ y es un PNG de %s',
    (src, sizes, type) => {
      const archivo = resolve(PUBLIC, `.${src}`);
      expect(existsSync(archivo), `no se encontro ${archivo}`).toBe(true);
      expect(type).toBe('image/png');
      expect(medidasPng(archivo)).toBe(sizes);
    },
  );

  // `any` de 192 y 512 los exige Chrome para instalar; los `maskable`, para
  // que Android no encoja el icono `any` dentro de un circulo blanco.
  it.each(['any', 'maskable'])('declara iconos %s de 192 y 512 px', (proposito) => {
    const tamanos = iconos.filter((icono) => icono.purpose === proposito).map((icono) => icono.sizes);
    expect(tamanos).toEqual(expect.arrayContaining(['192x192', '512x512']));
  });

  it('no fija la orientación: la PWA instalada debe poder rotar (WCAG 2.1, criterio 1.3.4)', () => {
    expect(manifest().orientation).toBeUndefined();
  });
});

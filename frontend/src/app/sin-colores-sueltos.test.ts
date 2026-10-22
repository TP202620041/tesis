import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/*
 * DIS-1: la interfaz usa solo los tokens semánticos de `globals.css`
 * (`bg-superficie`, `text-texto-2`, `border-linea-campo`…). `globals.css`
 * quita la paleta por defecto de Tailwind (`--color-*: initial`), así que una
 * clase como `text-slate-600` o `bg-sky-600` ya no pinta nada: este test la
 * encuentra antes de que llegue a la pantalla como un texto sin color.
 *
 * También vigila el celeste, que se dejó por su carga partidaria en Lima
 * (docs/diseno/2026-10-21-propuesta.md, §2.3).
 */

const SRC = join(import.meta.dirname, '..');
const PALETA =
  'slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|white|black';
const UTILIDADES = 'bg|text|border|ring|outline|divide|fill|stroke|from|via|to|accent|decoration|caret|placeholder|shadow';
const CLASE_DE_PALETA = new RegExp(
  `(?<![\\w-])(?:[a-z0-9-]+:|\\[[^\\]]+\\]:)*(?:${UTILIDADES})-(?:${PALETA})(?:-\\d{2,3})?(?:\\/\\d+)?(?![\\w-])`,
  'g',
);

function archivos(dir: string): string[] {
  return readdirSync(dir).flatMap((nombre) => {
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) return nombre === 'generated' ? [] : archivos(ruta);
    return /\.tsx?$/.test(nombre) && !/\.test\.tsx?$/.test(nombre) ? [ruta] : [];
  });
}

describe('sin colores de la paleta de Tailwind (DIS-1)', () => {
  it('ningún componente usa slate-*, sky-* ni otro color suelto: solo tokens', () => {
    const hallazgos = archivos(SRC).flatMap((ruta) =>
      [...readFileSync(ruta, 'utf8').matchAll(CLASE_DE_PALETA)].map(
        (m) => `${relative(SRC, ruta).replaceAll('\\', '/')}: ${m[0]}`,
      ),
    );
    expect(hallazgos).toEqual([]);
  });

  it('el patrón sí detecta una clase de la paleta (el test no pasa vacío)', () => {
    expect('className="rounded-md text-slate-600 hover:bg-sky-700"'.match(CLASE_DE_PALETA)).toEqual([
      'text-slate-600',
      'hover:bg-sky-700',
    ]);
    expect('className="text-texto-2 bg-superficie border-linea-campo"'.match(CLASE_DE_PALETA)).toBeNull();
  });
});

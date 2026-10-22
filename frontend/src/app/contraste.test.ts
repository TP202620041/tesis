import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/*
 * DIS-1: el contraste de los tokens no se revisa a ojo. `scripts/contraste-civica.json`
 * lista cada par (texto/fondo, borde/superficie…) con el mínimo que exige WCAG
 * y los tokens de donde sale cada color; se puede correr con el script de la
 * propuesta (`node ../docs/diseno/contraste/contraste.mjs scripts/contraste-civica.json`).
 *
 * Este test cierra el círculo: comprueba que los colores del JSON son los que
 * de verdad declara `globals.css` en cada tema (si alguien cambia un token, el
 * JSON deja de coincidir) y que cada par cumple su mínimo.
 */

const RAIZ = join(import.meta.dirname, '..', '..');
const css = readFileSync(join(RAIZ, 'src', 'app', 'globals.css'), 'utf8');
type Par = [string, string, string, number, string | null, string | null];
const grupos = JSON.parse(
  readFileSync(join(RAIZ, 'scripts', 'contraste-civica.json'), 'utf8'),
) as Record<string, Par[]>;

type Tema = 'claro' | 'oscuro' | 'alto-contraste';

/** Variables `--cv-*` declaradas en el bloque cuyo selector contiene `selector`. */
function bloque(selector: string): Record<string, string> {
  const inicio = css.indexOf(selector);
  if (inicio < 0) throw new Error(`No está el bloque ${selector} en globals.css`);
  const abre = css.indexOf('{', inicio);
  const cierra = css.indexOf('}', abre);
  const variables: Record<string, string> = {};
  for (const [, nombre, valor] of css.slice(abre, cierra).matchAll(/--cv-([a-z0-9-]+):\s*([^;]+);/g)) {
    variables[nombre!] = valor!.trim().toLowerCase();
  }
  return variables;
}

const base = bloque("[data-theme='claro']");
const TOKENS: Record<Tema, Record<string, string>> = {
  claro: base,
  // Los temas solo redefinen lo que cambia; el resto lo hereda de `:root`.
  oscuro: { ...base, ...bloque("[data-theme='oscuro'] {") },
  'alto-contraste': { ...base, ...bloque("[data-theme='alto-contraste'] {") },
};

function temaDelGrupo(grupo: string): Tema {
  if (grupo.includes('oscuro')) return 'oscuro';
  if (grupo.includes('alto contraste')) return 'alto-contraste';
  return 'claro';
}

const lum = (hex: string) => {
  const c = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4]
    .map((i) => parseInt(c.slice(i, i + 2), 16) / 255)
    .map((x) => (x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
};
const contraste = (a: string, b: string) => {
  const [claro, oscuro] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (claro! + 0.05) / (oscuro! + 0.05);
};

describe('contraste de los tokens (DIS-1)', () => {
  it('cubre los tres temas', () => {
    const temas = new Set(Object.keys(grupos).map(temaDelGrupo));
    expect([...temas].sort()).toEqual(['alto-contraste', 'claro', 'oscuro']);
  });

  for (const [grupo, pares] of Object.entries(grupos)) {
    const tema = temaDelGrupo(grupo);
    describe(grupo, () => {
      it.each(pares)('%s', (nombre, frente, fondo, minimo, tokenFrente, tokenFondo) => {
        if (tokenFrente) expect(TOKENS[tema][tokenFrente], `${nombre}: --cv-${tokenFrente}`).toBe(frente.toLowerCase());
        if (tokenFondo) expect(TOKENS[tema][tokenFondo], `${nombre}: --cv-${tokenFondo}`).toBe(fondo.toLowerCase());
        expect(contraste(frente, fondo)).toBeGreaterThanOrEqual(minimo);
      });
    });
  }
});

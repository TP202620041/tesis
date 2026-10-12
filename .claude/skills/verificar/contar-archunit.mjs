#!/usr/bin/env node
/**
 * Cuenta las violaciones congeladas de ArchUnit por regla (WORKFLOW.md, /verificar).
 * Uso: node contar-archunit.mjs [ruta-al-archunit_store]
 * Una violacion puede ocupar varias lineas (las que terminan en "\" continuan);
 * se cuenta una por cada linea que no es continuacion de la anterior.
 */
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const almacen = process.argv[2] ?? path.join(raiz, 'backend/src/test/resources/archunit_store');
const indice = path.join(almacen, 'stored.rules');
if (!existsSync(indice)) {
  console.error(`No existe ${indice}. Corre primero: mvn test -Dtest=ArquitecturaCapasTest`);
  process.exit(1);
}

const reglas = readFileSync(indice, 'utf8')
  .split(/\r?\n/)
  .filter((l) => l && !l.startsWith('#'))
  .map((l) => {
    const corte = l.lastIndexOf('=');
    return { regla: l.slice(0, corte).replace(/\\(.)/g, '$1'), archivo: l.slice(corte + 1).trim() };
  });

let total = 0;
const filas = reglas.map(({ regla, archivo }) => {
  const ruta = path.join(almacen, archivo);
  const lineas = existsSync(ruta) ? readFileSync(ruta, 'utf8').split(/\r?\n/) : [];
  let n = 0;
  lineas.forEach((l, i) => {
    if (l.trim() && !(i > 0 && lineas[i - 1].endsWith('\\'))) n++;
  });
  total += n;
  return { n, regla };
});
filas.sort((a, b) => b.n - a.n).forEach(({ n, regla }) => console.log(`${String(n).padStart(4)}  ${regla}`));
console.log(`${String(total).padStart(4)}  TOTAL violaciones congeladas`);

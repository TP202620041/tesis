#!/usr/bin/env node
/**
 * Comprueba que Vitest ejecuto TODOS los archivos de test del proyecto.
 *
 * Por que existe: en este entorno Windows, Vitest ha llegado a terminar
 * "verde" habiendo ejecutado un archivo de menos, sin error ni aviso. Un
 * fallo asi es peor que uno ruidoso —la suite dice que todo pasa mientras
 * calla que no probo algo— y este proyecto reporta conteos de tests como
 * evidencia. Esta guarda convierte ese silencio en un fallo.
 *
 * Lee el informe JSON que deja `npm test` y lo compara con los archivos
 * `*.test.ts(x)` que hay en `src/`.
 */
import { readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const RAIZ = resolve(import.meta.dirname, '..');
const INFORME = join(RAIZ, '.vitest-resultado.json');

const normalizar = (ruta) => relative(RAIZ, ruta).replaceAll('\\', '/');

function archivosDeTest(dir) {
  return readdirSync(dir).flatMap((entrada) => {
    const ruta = join(dir, entrada);
    if (statSync(ruta).isDirectory()) return archivosDeTest(ruta);
    return /\.test\.tsx?$/.test(entrada) ? [normalizar(ruta)] : [];
  });
}

let informe;
try {
  informe = JSON.parse(readFileSync(INFORME, 'utf8'));
} catch {
  console.error('No se encontro el informe de Vitest. ¿Corrio la suite?');
  process.exit(1);
}
rmSync(INFORME, { force: true });

const enDisco = archivosDeTest(join(RAIZ, 'src')).sort();
const ejecutados = [...new Set(informe.testResults.map((r) => normalizar(r.name)))].sort();
const faltantes = enDisco.filter((f) => !ejecutados.includes(f));

console.log(
  `\nVerificacion: ${informe.numPassedTests} tests en ${ejecutados.length} archivos ` +
    `(${enDisco.length} presentes en src/).`,
);

if (faltantes.length > 0) {
  console.error('\nERROR: Vitest NO ejecuto estos archivos:');
  for (const f of faltantes) console.error(`  - ${f}`);
  console.error('\nLa suite habria reportado verde sin probarlos. Vuelve a correrla.');
  process.exit(1);
}

if (informe.numFailedTests > 0) {
  console.error(`\nERROR: ${informe.numFailedTests} tests fallaron.`);
  process.exit(1);
}

console.log('Todos los archivos de test se ejecutaron.\n');

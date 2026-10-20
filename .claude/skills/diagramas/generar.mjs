#!/usr/bin/env node
/**
 * Corre los extractores de /diagramas y reemplaza SOLO lo que hay entre
 *   <!-- generado:inicio <bloque> -->   y   <!-- generado:fin <bloque> -->
 * en docs/arquitectura/. El texto escrito a mano fuera de los marcadores no se toca.
 *
 * Uso, desde la raíz del repo:
 *   node .claude/skills/diagramas/generar.mjs              escribe los bloques que cambiaron
 *   node .claude/skills/diagramas/generar.mjs --comprobar  no escribe; sale con 1 si algo cambiaría
 *
 * Salida: por bloque, "sin cambios" o "actualizado (+a −b líneas)", y las
 * diferencias con ARCHITECTURE.md que detectó cada extractor.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { RAIZ } from './comun.mjs';
import { generar as modulosBackend } from './modulos-backend.mjs';
import { generar as featuresFrontend } from './features-frontend.mjs';
import { generar as modeloDatos } from './modelo-datos.mjs';

const DESTINOS = [
  { archivo: 'docs/arquitectura/modulos.md', bloque: 'modulos-backend', extractor: modulosBackend },
  { archivo: 'docs/arquitectura/modulos.md', bloque: 'features-frontend', extractor: featuresFrontend },
  { archivo: 'docs/arquitectura/modelo-datos.md', bloque: 'modelo-datos', extractor: modeloDatos },
];

const comprobar = process.argv.includes('--comprobar');
const escapar = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const textos = new Map(); // archivo -> { texto (con \n), crlf }
let cambios = 0;
let errores = 0;

for (const { archivo, bloque, extractor } of DESTINOS) {
  const ruta = path.join(RAIZ, archivo);
  if (!existsSync(ruta)) {
    console.error(`ERROR ${archivo}: no existe. Créalo con los marcadores del bloque ${bloque}.`);
    errores++;
    continue;
  }
  if (!textos.has(archivo)) {
    const crudo = readFileSync(ruta, 'utf8');
    textos.set(archivo, { texto: crudo.replace(/\r\n/g, '\n'), crlf: crudo.includes('\r\n'), original: crudo.replace(/\r\n/g, '\n') });
  }
  const doc = textos.get(archivo);
  const re = new RegExp(`(<!-- generado:inicio ${escapar(bloque)} -->\\n)([\\s\\S]*?)(\\n<!-- generado:fin ${escapar(bloque)} -->)`);
  const m = doc.texto.match(re);
  if (!m) {
    console.error(`ERROR ${archivo}: faltan los marcadores <!-- generado:inicio ${bloque} --> / <!-- generado:fin ${bloque} -->.`);
    errores++;
    continue;
  }
  const { markdown, hallazgos } = extractor(RAIZ);
  const antes = m[2];
  if (antes === markdown) {
    console.log(`${bloque} (${archivo}): sin cambios`);
  } else {
    cambios++;
    const { mas, menos } = contarDiferencia(antes, markdown);
    console.log(`${bloque} (${archivo}): ${comprobar ? 'cambiaría' : 'actualizado'} (+${mas} −${menos} líneas)`);
    doc.texto = doc.texto.replace(re, (_, ini, __, fin) => `${ini}${markdown}${fin}`);
  }
  if (hallazgos.length) {
    console.log(`  diferencias con la norma o sentencias no interpretadas (${hallazgos.length}):`);
    for (const h of hallazgos) console.log(`  - ${h}`);
  }
}

if (!comprobar) {
  for (const [archivo, doc] of textos) {
    if (doc.texto === doc.original) continue;
    writeFileSync(path.join(RAIZ, archivo), doc.crlf ? doc.texto.replace(/\n/g, '\r\n') : doc.texto);
  }
}

if (errores) process.exit(2);
if (comprobar && cambios) process.exit(1);

/** Líneas agregadas y quitadas (multiconjunto), para el resumen. */
function contarDiferencia(a, b) {
  const cuenta = new Map();
  for (const l of a.split('\n')) cuenta.set(l, (cuenta.get(l) ?? 0) + 1);
  let mas = 0;
  for (const l of b.split('\n')) {
    if (cuenta.get(l)) cuenta.set(l, cuenta.get(l) - 1);
    else mas++;
  }
  const menos = [...cuenta.values()].reduce((s, n) => s + n, 0);
  return { mas, menos };
}

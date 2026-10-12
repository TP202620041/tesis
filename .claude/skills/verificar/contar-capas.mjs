#!/usr/bin/env node
/**
 * Cuenta los avisos de capas del frontend por bloque (WORKFLOW.md, /verificar).
 * Uso, desde frontend/:  npx eslint -f json -o .eslint-capas.json . ; node ../.claude/skills/verificar/contar-capas.mjs .eslint-capas.json
 * Cuenta solo no-restricted-imports (las reglas de eslint.capas.mjs); el resto del lint se reporta aparte.
 */
import { readFileSync } from 'node:fs';

const archivo = process.argv[2] ?? '.eslint-capas.json';
const resultados = JSON.parse(readFileSync(archivo, 'utf8'));
const porMensaje = new Map();
let total = 0;
let archivos = 0;
let otros = 0;
for (const r of resultados) {
  const propios = r.messages.filter((m) => m.ruleId === 'no-restricted-imports');
  otros += r.messages.length - propios.length;
  if (propios.length) archivos++;
  for (const m of propios) {
    total++;
    const clave = (m.message.split('. ').slice(1).join('. ') || m.message).slice(0, 90);
    porMensaje.set(clave, (porMensaje.get(clave) ?? 0) + 1);
  }
}
[...porMensaje.entries()].sort((a, b) => b[1] - a[1]).forEach(([k, n]) => console.log(`${String(n).padStart(4)}  ${k}`));
console.log(`${String(total).padStart(4)}  TOTAL avisos de capas en ${archivos} archivos`);
console.log(`${String(otros).padStart(4)}  otros avisos/errores de lint (no de capas)`);

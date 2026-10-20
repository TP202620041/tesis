#!/usr/bin/env node
/**
 * Valida la sintaxis Mermaid de docs/arquitectura/*.md con mermaid-cli (mmdc):
 * dibuja cada bloque ```mermaid en un directorio temporal y falla si alguno no
 * se puede dibujar. No escribe nada en el repo.
 *
 * Uso, desde la raíz del repo:  node .claude/skills/diagramas/validar.mjs
 * La primera vez npx descarga mermaid-cli y un Chromium (puede tardar).
 * Si no hay red o Chromium no arranca, sale con 3 y lo dice: entonces se
 * revisan a mano los tipos de diagrama (flowchart, erDiagram).
 */
import { mkdtempSync, writeFileSync, rmSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { RAIZ, leer, ordenar } from './comun.mjs';

const MMDC = '@mermaid-js/mermaid-cli@12.0.0';
const dir = path.join(RAIZ, 'docs/arquitectura');
const temporal = mkdtempSync(path.join(tmpdir(), 'diagramas-'));
const TIPOS = /^(flowchart|graph|erDiagram|C4Context|C4Container|sequenceDiagram|classDiagram|stateDiagram(-v2)?)\b/;

let total = 0;
let fallas = 0;
try {
  for (const archivo of readdirSync(dir).filter((f) => f.endsWith('.md')).sort(ordenar)) {
    const bloques = [...leer(path.join(dir, archivo)).matchAll(/```mermaid\n([\s\S]*?)```/g)].map((m) => m[1]);
    bloques.forEach((codigo, i) => {
      total++;
      const nombre = `${archivo.replace(/\.md$/, '')}-${i + 1}`;
      const tipo = codigo.trim().split('\n')[0].trim();
      if (!TIPOS.test(tipo)) {
        console.log(`FALLA ${archivo} bloque ${i + 1}: tipo de diagrama desconocido "${tipo}"`);
        fallas++;
        return;
      }
      const entrada = path.join(temporal, `${nombre}.mmd`);
      writeFileSync(entrada, codigo);
      // Una sola cadena con shell: npx es un .cmd en Windows. Las rutas vienen de tmpdir y van entre comillas.
      const salida = path.join(temporal, `${nombre}.svg`);
      const r = spawnSync(`npx -y ${MMDC} -q -i "${entrada}" -o "${salida}"`, { shell: true, encoding: 'utf8' });
      if (r.error || r.status === null) {
        console.error(`No se pudo ejecutar mermaid-cli: ${r.error?.message ?? 'sin estado de salida'}. Revisa a mano los tipos de diagrama.`);
        process.exitCode = 3;
        throw new Error('sin mmdc');
      }
      if (r.status !== 0) {
        fallas++;
        const detalle = `${r.stderr}${r.stdout}`.split('\n').filter((l) => /error|Parse|Expecting|line/i.test(l)).slice(0, 6).join('\n    ');
        console.log(`FALLA ${archivo} bloque ${i + 1} (${tipo}):\n    ${detalle || r.stderr.trim().slice(0, 400)}`);
      } else console.log(`ok    ${archivo} bloque ${i + 1} (${tipo})`);
    });
  }
} catch (e) {
  if (e.message !== 'sin mmdc') throw e;
} finally {
  rmSync(temporal, { recursive: true, force: true });
}

if (process.exitCode !== 3) {
  console.log(`${total - fallas}/${total} diagramas válidos`);
  if (fallas) process.exitCode = 1;
}

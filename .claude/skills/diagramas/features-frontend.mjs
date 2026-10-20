#!/usr/bin/env node
/**
 * Extractor `features-frontend` (/diagramas).
 *
 * Features de frontend/src/features/ y su relación con lib/, map/, pwa/,
 * components/ y los grupos de rutas de app/, según los import (estáticos,
 * `export … from` e `import()` dinámicos). No cuenta los tests (*.test.ts[x])
 * ni los tipos generados. Marca las dependencias que §5.2/§5.3 no permiten;
 * la medición oficial sigue siendo la de eslint.capas.mjs (/verificar).
 *
 * Uso: node .claude/skills/diagramas/features-frontend.mjs   (imprime el bloque)
 */
import path from 'node:path';
import { RAIZ, archivos, carpetas, leer, ordenar, idMermaid, etiqueta, esPrincipal } from './comun.mjs';

const CAPAS_FEATURE = ['components', 'hooks', 'model'];

/** Zona (nodo del diagrama) y capa/archivo de una ruta relativa a src/, sin extensión. */
function zona(rel) {
  const p = rel.replace(/\.(tsx?|mjs|js)$/, '').replace(/\/index$/, '').split('/');
  const [raiz, seg1, seg2] = p;
  if (raiz === 'features' && seg1) {
    const capa = seg2 === 'api' ? 'api.ts' : CAPAS_FEATURE.includes(seg2) ? seg2 : seg2 ? `${seg2} (fuera de capa)` : '(raíz)';
    return { nodo: `features/${seg1}`, tipo: 'feature', feature: seg1, capa };
  }
  if (raiz === 'app') {
    if (p.length > 2) return { nodo: `app/${seg1}`, tipo: 'app', capa: seg1 };
    return { nodo: 'app', tipo: 'app', capa: seg1 };
  }
  if (raiz === 'lib') {
    if (p.length > 2) return { nodo: `lib/${seg1}`, tipo: 'lib', capa: p.slice(2).join('/') };
    return { nodo: 'lib', tipo: 'lib', capa: seg1 };
  }
  if (['map', 'pwa', 'components'].includes(raiz)) return { nodo: raiz, tipo: raiz, capa: p.slice(1).join('/') };
  return { nodo: raiz, tipo: 'otro', capa: p.slice(1).join('/') || raiz };
}

/** Motivo por el que una importación rompe §5, o null. */
function motivo(o, d) {
  if (o.tipo === 'app' && d.tipo === 'feature' && d.capa === 'api.ts') return '§5.2: app/ no importa api.ts';
  if (o.tipo === 'app' && d.nodo === 'lib/api') return '§5.2: app/ no importa lib/api';
  if (o.tipo === 'feature' && d.tipo === 'feature' && o.feature !== d.feature && d.capa !== 'model')
    return `§5.3: de otra feature solo se importa su model/ (usa ${d.capa})`;
  if (o.tipo === 'feature' && o.capa === 'components' && d.nodo === 'lib/api') return '§5.2: components/ no usa el cliente HTTP';
  if (o.tipo === 'feature' && o.capa === 'model' && d.nodo === 'lib/api' && /^(client|errors)$/.test(d.capa))
    return '§5.2: model/ es puro, sin cliente HTTP';
  if (o.tipo === 'components' && (d.tipo === 'feature' || d.tipo === 'app')) return '§5.3: components/ no depende de features ni de app';
  if ((o.tipo === 'map' || o.tipo === 'pwa') && d.tipo === 'feature' && d.capa !== 'model')
    return `§5.3: ${o.tipo}/ usa model/ y lib/, nunca ${d.capa}`;
  if ((o.tipo === 'map' || o.tipo === 'pwa') && d.tipo === 'app') return `§5.3: ${o.tipo}/ no depende de app`;
  if (o.tipo === 'lib' && (d.tipo === 'feature' || d.tipo === 'app')) return 'lib/ es compartido: no depende de features ni de app (eslint.capas.mjs)';
  return null;
}

export function generar(raiz = RAIZ) {
  const src = path.join(raiz, 'frontend/src');
  const fuentes = archivos(
    src,
    (r) => /\.(tsx?|mjs)$/.test(r) && !/\.test\.tsx?$/.test(r) && !r.endsWith('.d.ts') && !r.startsWith('lib/api/generated/'),
  );
  const existentes = new Set(fuentes.map((f) => f.replace(/\.(tsx?|mjs)$/, '')));

  // origen -> destino -> { capas: Set, motivos: Map(motivo -> Set(archivos)) }
  const aristas = new Map();
  const nodos = new Map(); // nodo -> Set(capas presentes)
  const anotarNodo = (z) => {
    if (!nodos.has(z.nodo)) nodos.set(z.nodo, { tipo: z.tipo, capas: new Set() });
    if (z.tipo === 'feature') nodos.get(z.nodo).capas.add(z.capa);
  };

  const reImport = /(?:\bfrom\s*|\bimport\s*\(\s*|^\s*import\s+)['"]([^'"]+)['"]/gm;
  const fueraDeCapa = [];
  for (const rel of fuentes) {
    const o = zona(rel);
    anotarNodo(o);
    if (o.tipo === 'feature' && o.capa.endsWith('(fuera de capa)')) fueraDeCapa.push(rel);
    for (const m of leer(path.join(src, rel)).matchAll(reImport)) {
      const spec = m[1];
      let destino;
      if (spec.startsWith('@/')) destino = spec.slice(2);
      else if (spec.startsWith('.')) destino = path.posix.normalize(path.posix.join(path.posix.dirname(rel), spec));
      else continue; // librería externa
      if (destino.startsWith('..')) continue;
      if (/\.(css|json|svg|png)$/.test(destino)) continue;
      if (!existentes.has(destino) && existentes.has(`${destino}/index`)) destino = `${destino}/index`;
      const d = zona(destino);
      anotarNodo(d);
      if (d.nodo === o.nodo) continue;
      if (!aristas.has(o.nodo)) aristas.set(o.nodo, new Map());
      const porDestino = aristas.get(o.nodo);
      if (!porDestino.has(d.nodo)) porDestino.set(d.nodo, { capas: new Set(), motivos: new Map() });
      const a = porDestino.get(d.nodo);
      a.capas.add(d.capa);
      const mot = motivo(o, d);
      if (mot) {
        if (!a.motivos.has(mot)) a.motivos.set(mot, new Set());
        a.motivos.get(mot).add(rel);
      }
    }
  }

  // Features sin archivos fuera de tests igual aparecen como nodo.
  for (const f of carpetas(path.join(src, 'features'))) anotarNodo({ nodo: `features/${f}`, tipo: 'feature', capa: '(raíz)' });

  const lista = [];
  for (const o of [...aristas.keys()].sort(ordenar)) {
    for (const d of [...aristas.get(o).keys()].sort(ordenar)) {
      const a = aristas.get(o).get(d);
      lista.push({ origen: o, destino: d, capas: [...a.capas].sort(ordenar), motivos: a.motivos });
    }
  }

  const id = (n) => idMermaid('n', n);
  const etiquetaNodo = (n) => {
    const info = nodos.get(n);
    if (info.tipo !== 'feature') return n;
    const capas = [...info.capas].filter((c) => c !== '(raíz)').sort(ordenar);
    return capas.length ? `${n}<br/>${capas.join(' · ')}` : n;
  };

  const diagrama = (titulo, aristasDe, grupos) => {
    const usadas = new Set(aristasDe.flatMap((a) => [a.origen, a.destino]));
    const out = ['```mermaid', 'flowchart LR'];
    for (const [nombre, filtro] of grupos) {
      const miembros = [...usadas].filter(filtro).sort(ordenar);
      if (!miembros.length) continue;
      out.push(`  subgraph ${idMermaid('g', nombre)}["${etiqueta(nombre)}"]`);
      for (const n of miembros) out.push(`    ${id(n)}["${etiqueta(etiquetaNodo(n))}"]`);
      out.push('  end');
    }
    const marcadas = [];
    aristasDe.forEach((a, i) => {
      const texto = etiqueta(a.capas.join(', '));
      if (a.motivos.size) {
        marcadas.push(i);
        out.push(`  ${id(a.origen)} -.->|"${texto} (fuera de §5)"| ${id(a.destino)}`);
      } else out.push(`  ${id(a.origen)} -->|"${texto}"| ${id(a.destino)}`);
    });
    if (marcadas.length) out.push(`  linkStyle ${marcadas.join(',')} stroke:#c62828,stroke-width:2px`);
    out.push('```');
    return [`### ${titulo}`, '', ...out];
  };

  const esApp = (n) => n === 'app' || n.startsWith('app/');
  const grupos = [
    ['app/ (rutas)', esApp],
    ['features/', (n) => n.startsWith('features/')],
    ['compartidos', (n) => !esApp(n) && !n.startsWith('features/')],
  ];
  const desdeApp = lista.filter((a) => esApp(a.origen));
  const resto = lista.filter((a) => !esApp(a.origen));

  const hallazgos = fueraDeCapa.map((r) => `\`${r}\` está fuera de components/, hooks/, model/ y api.ts (§5.1).`);
  for (const a of lista) {
    for (const [m, archivosM] of [...a.motivos.entries()].sort((x, y) => ordenar(x[0], y[0]))) {
      hallazgos.push(`\`${a.origen}\` → \`${a.destino}\`: ${m} (${[...archivosM].sort(ordenar).join(', ')}).`);
    }
  }

  const tabla = ['| Origen | Destino | Qué usa | ¿Permitido por §5? |', '|---|---|---|---|'];
  for (const a of lista) {
    tabla.push(`| \`${a.origen}\` | \`${a.destino}\` | ${a.capas.map((c) => `\`${c}\``).join(', ')} | ${a.motivos.size ? '**no**' : 'sí'} |`);
  }

  const md = [
    '<!-- No editar a mano: lo regenera /diagramas (.claude/skills/diagramas/features-frontend.mjs). -->',
    '',
    ...diagrama('Rutas (app/) hacia features y compartidos', desdeApp, grupos),
    '',
    ...diagrama('Features y compartidos', resto, grupos),
    '',
    ...tabla,
    '',
    '**Diferencias con §5** (se dibujan como son; la cifra oficial es la de `eslint.capas.mjs` en `/verificar`):',
    '',
    ...(hallazgos.length ? hallazgos.map((h) => `- ${h}`) : ['- Ninguna.']),
  ].join('\n');

  return { markdown: md, hallazgos };
}

if (esPrincipal(import.meta.url)) console.log(generar().markdown);

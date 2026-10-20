#!/usr/bin/env node
/**
 * Extractor `modulos-backend` (/diagramas).
 *
 * Módulos de pe.edu.upc.viasegura y sus dependencias reales según los import
 * entre paquetes de primer nivel, con el subpaquete de destino. Compara cada
 * dependencia con la tabla de ARCHITECTURE.md §4.3 y marca, sin corregirla,
 * la que no está prevista.
 *
 * Uso: node .claude/skills/diagramas/modulos-backend.mjs   (imprime el bloque)
 */
import path from 'node:path';
import { RAIZ, archivos, carpetas, leer, ordenar, idMermaid, etiqueta, esPrincipal, leerNormaModulos } from './comun.mjs';

const PAQUETE = 'pe.edu.upc.viasegura';
const ESTANDAR_41 = ['controller', 'dto', 'service', 'listener', 'domain', 'event', 'port', 'repository', 'infra'];

export function generar(raiz = RAIZ) {
  const base = path.join(raiz, 'backend/src/main/java', ...PAQUETE.split('.'));
  const modulos = carpetas(base);
  const subpaquetes = new Map(modulos.map((m) => [m, carpetas(path.join(base, m))]));

  // origen -> destino -> subpaquete -> Set(archivos de origen)
  const deps = new Map();
  const reImport = new RegExp(`^import\\s+(?:static\\s+)?${PAQUETE.replace(/\./g, '\\.')}\\.([a-z0-9_]+)(?:\\.([a-z0-9_]+))?`, 'gm');
  for (const rel of archivos(base, (r) => r.endsWith('.java'))) {
    const origen = rel.split('/')[0];
    if (!rel.includes('/')) continue; // ViaSeguraApplication: fuera de los módulos
    for (const m of leer(path.join(base, rel)).matchAll(reImport)) {
      const destino = m[1];
      if (destino === origen) continue;
      const sub = m[2] ?? '(raíz)';
      if (!deps.has(origen)) deps.set(origen, new Map());
      const porDestino = deps.get(origen);
      if (!porDestino.has(destino)) porDestino.set(destino, new Map());
      const porSub = porDestino.get(destino);
      if (!porSub.has(sub)) porSub.set(sub, new Set());
      porSub.get(sub).add(`${origen}/${rel.split('/').slice(1).join('/')}`);
    }
  }

  const norma = leerNormaModulos(raiz);
  const hallazgos = [];
  if (!norma) hallazgos.push('No se pudo leer la tabla de ARCHITECTURE.md §4.3: las dependencias se dibujan sin comparar.');

  // Aristas ordenadas y evaluadas contra §4.3.
  const aristas = [];
  for (const origen of [...deps.keys()].sort(ordenar)) {
    for (const destino of [...deps.get(origen).keys()].sort(ordenar)) {
      const porSub = deps.get(origen).get(destino);
      const subs = [...porSub.keys()].sort(ordenar);
      const motivos = [];
      if (norma) {
        if (origen === 'common') {
          motivos.push('common es transversal y no depende de ningún módulo');
        } else if (destino !== 'common') {
          const fila = norma.modulos.get(origen);
          const permitido = fila?.usa.has(destino);
          if (!fila) motivos.push(`el módulo ${origen} no tiene fila en §4.3`);
          else if (!permitido) motivos.push(`§4.3 no prevé que ${origen} use a ${destino}`);
          for (const s of subs) {
            const archivosSub = [...porSub.get(s)].sort(ordenar);
            if (norma.internos.includes(s)) {
              motivos.push(`usa ${destino}.${s}, interno del módulo (${archivosSub.join(', ')})`);
            } else if (!norma.publicos.includes(s)) {
              motivos.push(`usa ${destino}.${s}, que no es API pública (${archivosSub.join(', ')})`);
            } else if (permitido && fila.usa.get(destino) && !fila.usa.get(destino).has(s)) {
              motivos.push(`§4.3 limita ${origen} → ${destino} a ${[...fila.usa.get(destino)].join(', ')} y usa ${s} (${archivosSub.join(', ')})`);
            }
          }
        }
      }
      aristas.push({ origen, destino, subs, motivos });
    }
  }

  // Ciclos entre módulos (Tarjan, en orden alfabético para que sea estable).
  const ciclos = componentesConCiclo(modulos, (m) => [...(deps.get(m)?.keys() ?? [])].sort(ordenar));
  for (const c of ciclos) hallazgos.push(`Ciclo entre módulos: ${c.join(' ↔ ')}.`);

  for (const a of aristas) {
    for (const motivo of a.motivos) hallazgos.push(`\`${a.origen}\` → \`${a.destino}\`: ${motivo}.`);
  }
  const sinFila = norma ? modulos.filter((m) => !norma.modulos.has(m)) : [];
  for (const m of sinFila) hallazgos.push(`El módulo \`${m}\` existe en el código y no tiene fila en §4.3.`);

  // ---- Mermaid ----
  const id = (m) => idMermaid('m', m);
  const lineas = ['```mermaid', 'flowchart LR'];
  for (const m of modulos) {
    const subs = subpaquetes.get(m).map((s) => (ESTANDAR_41.includes(s) ? s : `${s}*`));
    lineas.push(`  ${id(m)}["${etiqueta(`${m}<br/>${subs.join(' · ')}`)}"]`);
  }
  const marcadas = [];
  aristas.forEach((a, i) => {
    const texto = etiqueta(a.subs.join(', '));
    if (a.motivos.length) {
      marcadas.push(i);
      lineas.push(`  ${id(a.origen)} -.->|"${texto} (fuera de §4.3)"| ${id(a.destino)}`);
    } else {
      lineas.push(`  ${id(a.origen)} -->|"${texto}"| ${id(a.destino)}`);
    }
  });
  lineas.push('  classDef transversal fill:#eef2f7,stroke:#6b7a90,color:#1f2937');
  if (modulos.includes('common')) lineas.push(`  class ${id('common')} transversal`);
  if (marcadas.length) lineas.push(`  linkStyle ${marcadas.join(',')} stroke:#c62828,stroke-width:2px`);
  lineas.push('```');

  // ---- Tabla y hallazgos ----
  const tabla = ['| Origen | Destino | Subpaquetes usados | ¿Prevista en §4.3? |', '|---|---|---|---|'];
  for (const a of aristas) {
    const prevista = !norma ? 'sin comparar' : a.motivos.length ? '**no**' : a.destino === 'common' ? 'sí (common es transversal)' : 'sí';
    tabla.push(`| \`${a.origen}\` | \`${a.destino}\` | ${a.subs.map((s) => `\`${s}\``).join(', ')} | ${prevista} |`);
  }

  const noEstandar = modulos
    .map((m) => [m, subpaquetes.get(m).filter((s) => !ESTANDAR_41.includes(s))])
    .filter(([, s]) => s.length);
  const planificados = norma ? [...norma.modulos.keys()].filter((m) => !modulos.includes(m)).sort(ordenar) : [];

  const md = [
    '<!-- No editar a mano: lo regenera /diagramas (.claude/skills/diagramas/modulos-backend.mjs). -->',
    '',
    ...lineas,
    '',
    ...tabla,
    '',
    `Subpaquetes marcados con \`*\`: fuera de la lista estándar de §4.1. ${
      noEstandar.length ? noEstandar.map(([m, s]) => `\`${m}\`: ${s.map((x) => `\`${x}\``).join(', ')}`).join('; ') + '.' : 'Ninguno.'
    }`,
    '',
    `Módulos de §4.3 que todavía no existen en el código: ${planificados.length ? planificados.map((m) => `\`${m}\` (${norma.modulos.get(m).estado || 'sin estado'})`).join(', ') + '.' : 'ninguno.'}`,
    '',
    '**Diferencias con §4.3** (se dibujan como son; si hay que cambiar la norma o el código, `/propuesta`):',
    '',
    ...(hallazgos.length ? hallazgos.map((h) => `- ${h}`) : ['- Ninguna.']),
  ].join('\n');

  return { markdown: md, hallazgos };
}

/** Componentes fuertemente conexas con más de un nodo (ciclos), en orden estable. */
function componentesConCiclo(nodos, vecinos) {
  let indice = 0;
  const idx = new Map();
  const bajo = new Map();
  const pila = [];
  const enPila = new Set();
  const salida = [];
  const visitar = (v) => {
    idx.set(v, indice);
    bajo.set(v, indice++);
    pila.push(v);
    enPila.add(v);
    for (const w of vecinos(v)) {
      if (!idx.has(w)) {
        visitar(w);
        bajo.set(v, Math.min(bajo.get(v), bajo.get(w)));
      } else if (enPila.has(w)) bajo.set(v, Math.min(bajo.get(v), idx.get(w)));
    }
    if (bajo.get(v) === idx.get(v)) {
      const comp = [];
      let w;
      do {
        w = pila.pop();
        enPila.delete(w);
        comp.push(w);
      } while (w !== v);
      if (comp.length > 1) salida.push(comp.sort(ordenar));
    }
  };
  for (const n of nodos) if (!idx.has(n)) visitar(n);
  return salida.sort((a, b) => ordenar(a.join(), b.join()));
}

if (esPrincipal(import.meta.url)) console.log(generar().markdown);

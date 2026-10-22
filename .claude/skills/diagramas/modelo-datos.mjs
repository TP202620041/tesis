#!/usr/bin/env node
/**
 * Extractor `modelo-datos` (/diagramas).
 *
 * Reconstruye el esquema aplicando EN ORDEN de versión todas las migraciones
 * backend/src/main/resources/db/migration/V*.sql: CREATE TABLE, ALTER TABLE
 * (ADD/DROP/ALTER/RENAME COLUMN, ADD/DROP CONSTRAINT), REFERENCES, CREATE/DROP
 * INDEX, DROP TABLE y CREATE/DROP [MATERIALIZED] VIEW. Los bloques DO sin DDL
 * (comprobaciones antes de corregir datos) no cambian el esquema y se saltan;
 * uno con DDL o EXECUTE sale en los hallazgos. Dibuja un erDiagram con
 * las columnas clave (PK, FK, UNIQUE, columnas con CHECK … IN y geográficas) y,
 * aparte, las vistas materializadas con sus tablas de origen.
 *
 * Una sentencia que no sabe interpretar no se ignora en silencio: sale en los
 * hallazgos para que se amplíe el extractor.
 *
 * Uso: node .claude/skills/diagramas/modelo-datos.mjs   (imprime el bloque)
 */
import path from 'node:path';
import { RAIZ, archivos, leer, ordenar, idMermaid, etiqueta, esPrincipal } from './comun.mjs';

const IGNORADAS = /^(CREATE EXTENSION|INSERT|UPDATE|DELETE|COMMENT ON|GRANT|REVOKE|REFRESH|SELECT|SET|CREATE SEQUENCE|ALTER SEQUENCE|ANALYZE|VACUUM)\b/i;
// Dentro de un bloque DO: lo que podría cambiar el esquema.
const DDL_EN_BLOQUE = /\b(CREATE|ALTER|DROP|EXECUTE)\b/i;
const sinLiterales = (s) => s.replace(/'(?:[^']|'')*'/g, "''");

export function generar(raiz = RAIZ) {
  const dir = path.join(raiz, 'backend/src/main/resources/db/migration');
  const migraciones = archivos(dir, (r) => /^V\d+(?:[._]\d+)*__.+\.sql$/.test(r))
    .map((f) => ({ f, version: f.match(/^V(\d+(?:[._]\d+)*)__/)[1].split(/[._]/).map(Number) }))
    .sort((a, b) => compararVersion(a.version, b.version));

  const tablas = new Map();
  const vistas = new Map();
  const indices = new Map(); // nombre -> { tabla, cols, unico, parcial }
  const hallazgos = [];
  let anonimo = 0;

  const tabla = (nombre, v) => {
    if (!tablas.has(nombre)) {
      hallazgos.push(`${v}: ALTER sobre la tabla \`${nombre}\`, que no se creó en una migración anterior.`);
      tablas.set(nombre, nuevaTabla(v));
    }
    return tablas.get(nombre);
  };

  for (const { f } of migraciones) {
    const v = f.split('__')[0];
    for (const sentencia of sentencias(leer(path.join(dir, f)))) {
      const s = sentencia.replace(/\s+/g, ' ').trim();
      let m;
      if ((m = s.match(/^CREATE TABLE (?:IF NOT EXISTS )?([\w.]+) \((.*)\)$/i))) {
        const t = nuevaTabla(v);
        tablas.set(nombreSimple(m[1]), t);
        for (const def of partir(m[2])) agregarDefinicion(t, def, () => `#${++anonimo}`);
      } else if ((m = s.match(/^ALTER TABLE (?:IF EXISTS )?(?:ONLY )?([\w.]+) (.*)$/i))) {
        let nombre = nombreSimple(m[1]);
        const t = tabla(nombre, v);
        if (!t.migraciones.includes(v)) t.migraciones.push(v);
        for (const accion of partir(m[2])) {
          const nuevo = aplicarAlter(t, accion, () => `#${++anonimo}`);
          if (nuevo === false) hallazgos.push(`${v}: acción no interpretada en \`ALTER TABLE ${nombre}\`: \`${accion}\`.`);
          else if (typeof nuevo === 'string') {
            tablas.delete(nombre);
            tablas.set(nuevo, t);
            for (const otra of tablas.values()) {
              for (const c of otra.columnas.values()) if (c.ref === nombre) c.ref = nuevo;
              for (const r of otra.restricciones.values()) if (r.ref === nombre) r.ref = nuevo;
            }
            for (const i of indices.values()) if (i.tabla === nombre) i.tabla = nuevo;
            nombre = nuevo;
          }
        }
      } else if ((m = s.match(/^DROP TABLE (?:IF EXISTS )?(.+?)(?: CASCADE| RESTRICT)?$/i))) {
        for (const n of m[1].split(',').map((x) => nombreSimple(x.trim()))) tablas.delete(n);
      } else if ((m = s.match(/^CREATE (UNIQUE )?INDEX (?:CONCURRENTLY )?(?:IF NOT EXISTS )?(\w+) ON (?:ONLY )?([\w.]+)(?: USING \w+)? ?\((.*?)\)(.*)$/i))) {
        const cols = partir(m[4]).map((c) => c.split(' ')[0].replace(/"/g, ''));
        indices.set(m[2], { tabla: nombreSimple(m[3]), cols, unico: Boolean(m[1]), parcial: /\bWHERE\b/i.test(m[5]) });
      } else if ((m = s.match(/^DROP INDEX (?:CONCURRENTLY )?(?:IF EXISTS )?([\w.]+)/i))) {
        indices.delete(nombreSimple(m[1]));
      } else if ((m = s.match(/^CREATE (?:OR REPLACE )?(MATERIALIZED )?VIEW (?:IF NOT EXISTS )?([\w.]+) AS (.*)$/i))) {
        const nombre = nombreSimple(m[2]);
        const previa = vistas.get(nombre);
        vistas.set(nombre, {
          materializada: Boolean(m[1]),
          ...analizarConsulta(m[3]),
          migraciones: [...(previa?.migraciones ?? []), v],
        });
      } else if ((m = s.match(/^DROP (MATERIALIZED )?VIEW (?:IF EXISTS )?([\w.]+)/i))) {
        const previa = vistas.get(nombreSimple(m[2]));
        if (previa) previa.eliminada = true; // si se recrea, conserva la historia de migraciones
      } else if (/^DO\b/i.test(s)) {
        // Bloque anónimo PL/pgSQL. Sin DDL (p. ej. la comprobación de V18
        // antes de corregir datos) no cambia el esquema; con DDL o SQL
        // dinámico (EXECUTE) no se sabe qué cambia, así que sale en los hallazgos.
        if (DDL_EN_BLOQUE.test(sinLiterales(s))) {
          hallazgos.push(`${v}: bloque DO con DDL o EXECUTE, no interpretado: \`${s.slice(0, 80)}${s.length > 80 ? '…' : ''}\`.`);
        }
      } else if (!IGNORADAS.test(s)) {
        hallazgos.push(`${v}: sentencia no interpretada: \`${s.slice(0, 80)}${s.length > 80 ? '…' : ''}\`.`);
      }
    }
  }
  for (const [n, vista] of [...vistas.entries()]) if (vista.eliminada && !vista.columnas) vistas.delete(n);

  // ---- Derivar claves ----
  const nombres = [...tablas.keys()].sort(ordenar);
  const derivadas = new Map();
  for (const n of nombres) {
    const t = tablas.get(n);
    const pk = new Set();
    const uk = new Set();
    const fk = new Map(); // columna -> tabla destino
    const enumeradas = new Map(); // columna -> valores
    for (const [col, c] of t.columnas) {
      if (c.pk) pk.add(col);
      if (c.unico) uk.add(col);
      if (c.ref) fk.set(col, c.ref);
    }
    for (const r of t.restricciones.values()) {
      if (r.tipo === 'pk') r.cols.forEach((c) => pk.add(c));
      if (r.tipo === 'uk' && r.cols.length === 1) uk.add(r.cols[0]);
      if (r.tipo === 'fk' && r.cols.length === 1) fk.set(r.cols[0], r.ref);
      if (r.tipo === 'check') for (const [col, valores] of r.enumeradas) enumeradas.set(col, valores);
    }
    for (const i of indices.values()) if (i.tabla === n && i.unico && !i.parcial && i.cols.length === 1) uk.add(i.cols[0]);
    derivadas.set(n, { pk, uk, fk, enumeradas });
  }

  // ---- erDiagram ----
  const er = ['```mermaid', 'erDiagram'];
  for (const n of nombres) {
    const t = tablas.get(n);
    const d = derivadas.get(n);
    er.push(`  ${n} {`);
    for (const [col, c] of t.columnas) {
      const geo = /^geo(graphy|metry)$/.test(c.tipoBase);
      if (!d.pk.has(col) && !d.uk.has(col) && !d.fk.has(col) && !d.enumeradas.has(col) && !geo) continue;
      const claves = [d.pk.has(col) && 'PK', d.fk.has(col) && 'FK', d.uk.has(col) && 'UK'].filter(Boolean);
      const notas = [];
      if (d.enumeradas.has(col)) notas.push(d.enumeradas.get(col).join(', '));
      if (geo && c.parametros) notas.push(c.parametros);
      if (!c.noNulo && !d.pk.has(col)) notas.push('nullable');
      er.push(`    ${c.tipoBase} ${col}${claves.length ? ` ${claves.join(', ')}` : ''}${notas.length ? ` "${etiqueta(notas.join(' · '))}"` : ''}`);
    }
    er.push('  }');
  }
  const relaciones = [];
  for (const n of nombres) {
    const t = tablas.get(n);
    const d = derivadas.get(n);
    for (const [col, destino] of [...d.fk.entries()].sort((a, b) => ordenar(a[0], b[0]))) {
      const nulo = !t.columnas.get(col)?.noNulo;
      const padre = nulo ? '|o' : '||';
      const hijo = d.uk.has(col) ? 'o|' : 'o{';
      relaciones.push(`  ${destino} ${padre}--${hijo} ${n} : "${col}"`);
      if (!tablas.has(destino)) hallazgos.push(`\`${n}.${col}\` referencia a \`${destino}\`, que no existe en el esquema final.`);
    }
  }
  er.push(...relaciones.sort(ordenar), '```');

  const resumen = ['| Tabla | Columnas | Unicidad compuesta o parcial | Creada en | Modificada en |', '|---|---|---|---|---|'];
  for (const n of nombres) {
    const t = tablas.get(n);
    const compuestas = [
      ...[...t.restricciones.values()].filter((r) => r.tipo === 'uk' && r.cols.length > 1).map((r) => `(${r.cols.join(', ')})`),
      ...[...indices.values()]
        .filter((i) => i.tabla === n && i.unico && (i.parcial || i.cols.length > 1))
        .map((i) => `(${i.cols.join(', ')})${i.parcial ? ' parcial' : ''}`),
    ].sort(ordenar);
    resumen.push(`| \`${n}\` | ${t.columnas.size} | ${compuestas.length ? compuestas.join('; ') : '—'} | ${t.creadaEn} | ${t.migraciones.length ? t.migraciones.join(', ') : '—'} |`);
  }

  // ---- Vistas (aparte) ----
  const nombresVistas = [...vistas.keys()].sort(ordenar);
  const vistasMd = [];
  if (nombresVistas.length) {
    const fc = ['```mermaid', 'flowchart LR'];
    const fuentes = new Set(nombresVistas.flatMap((n) => vistas.get(n).fuentes));
    for (const f of [...fuentes].sort(ordenar)) fc.push(`  ${idMermaid('t', f)}[("${etiqueta(f)}")]`);
    for (const n of nombresVistas) {
      const vista = vistas.get(n);
      fc.push(`  ${idMermaid('v', n)}[["${etiqueta(`${n}<br/>${vista.materializada ? 'vista materializada' : 'vista'}`)}"]]`);
    }
    for (const n of nombresVistas) for (const f of vistas.get(n).fuentes) fc.push(`  ${idMermaid('t', f)} --> ${idMermaid('v', n)}`);
    fc.push('```');
    vistasMd.push(...fc, '', '| Vista | Columnas | Tablas de origen | Migraciones |', '|---|---|---|---|');
    for (const n of nombresVistas) {
      const vista = vistas.get(n);
      vistasMd.push(`| \`${n}\` | ${vista.columnas.map((c) => `\`${c}\``).join(', ')} | ${vista.fuentes.map((f) => `\`${f}\``).join(', ')} | ${vista.migraciones.join(', ')} |`);
    }
  } else vistasMd.push('No hay vistas.');

  const md = [
    '<!-- No editar a mano: lo regenera /diagramas (.claude/skills/diagramas/modelo-datos.mjs). -->',
    '',
    `Esquema que resulta de aplicar ${migraciones.length} migraciones (${migraciones.map((x) => x.f.split('__')[0]).join(', ')}).`,
    '',
    '## Tablas',
    '',
    ...er,
    '',
    ...resumen,
    '',
    '## Vistas',
    '',
    ...vistasMd,
    ...(hallazgos.length ? ['', '**Sentencias que el extractor no supo interpretar** (amplíalo antes de confiar en el diagrama):', '', ...hallazgos.map((h) => `- ${h}`)] : []),
  ].join('\n');

  return { markdown: md, hallazgos };
}

/* ------------------------------------------------------------------ */

function nuevaTabla(v) {
  return { columnas: new Map(), restricciones: new Map(), creadaEn: v, migraciones: [] };
}

const nombreSimple = (n) => n.replace(/"/g, '').replace(/^public\./i, '');

function compararVersion(a, b) {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    if (d) return d;
  }
  return 0;
}

/** Quita comentarios y parte en sentencias por ';' fuera de comillas y de $$. */
function sentencias(sql) {
  const salida = [];
  let actual = '';
  let comilla = false;
  let dolar = false;
  for (let i = 0; i < sql.length; i++) {
    const c = sql[i];
    const sig = sql[i + 1];
    if (!comilla && !dolar && c === '-' && sig === '-') {
      while (i < sql.length && sql[i] !== '\n') i++;
      actual += '\n';
      continue;
    }
    if (!comilla && !dolar && c === '/' && sig === '*') {
      i = sql.indexOf('*/', i + 2);
      if (i < 0) break;
      i++;
      continue;
    }
    if (!dolar && c === "'") comilla = !comilla;
    if (!comilla && c === '$' && sig === '$') {
      dolar = !dolar;
      actual += '$$';
      i++;
      continue;
    }
    if (!comilla && !dolar && c === ';') {
      if (actual.trim()) salida.push(actual.trim());
      actual = '';
      continue;
    }
    actual += c;
  }
  if (actual.trim()) salida.push(actual.trim());
  return salida;
}

/** Parte por comas de primer nivel (fuera de paréntesis y comillas). */
function partir(texto) {
  const partes = [];
  let nivel = 0;
  let comilla = false;
  let actual = '';
  for (const c of texto) {
    if (c === "'") comilla = !comilla;
    if (!comilla && c === '(') nivel++;
    if (!comilla && c === ')') nivel--;
    if (!comilla && nivel === 0 && c === ',') {
      partes.push(actual.trim());
      actual = '';
    } else actual += c;
  }
  if (actual.trim()) partes.push(actual.trim());
  return partes;
}

const cols = (lista) => lista.split(',').map((c) => c.trim().replace(/"/g, ''));

function enumeradasDe(check) {
  const salida = [];
  for (const m of check.matchAll(/(\w+)\s+IN\s*\(([^)]*)\)/gi)) {
    salida.push([m[1], [...m[2].matchAll(/'([^']*)'/g)].map((x) => x[1])]);
  }
  return salida;
}

const ES_RESTRICCION = /^(CONSTRAINT\s|PRIMARY KEY|UNIQUE\s*\(|FOREIGN KEY|CHECK\s*\(|EXCLUDE\s)/i;

function agregarDefinicion(t, def, anonimo) {
  if (ES_RESTRICCION.test(def)) agregarRestriccion(t, def, anonimo);
  else agregarColumna(t, def, anonimo);
}

function agregarRestriccion(t, def, anonimo) {
  let nombre = anonimo();
  let resto = def;
  const m = def.match(/^CONSTRAINT (\w+) (.*)$/i);
  if (m) [, nombre, resto] = m;
  let x;
  if ((x = resto.match(/^PRIMARY KEY \((.*?)\)/i))) t.restricciones.set(nombre, { tipo: 'pk', cols: cols(x[1]) });
  else if ((x = resto.match(/^UNIQUE \((.*?)\)/i))) t.restricciones.set(nombre, { tipo: 'uk', cols: cols(x[1]) });
  else if ((x = resto.match(/^FOREIGN KEY \((.*?)\) REFERENCES ([\w.]+)/i)))
    t.restricciones.set(nombre, { tipo: 'fk', cols: cols(x[1]), ref: nombreSimple(x[2]) });
  else if (/^CHECK/i.test(resto)) {
    const enumeradas = enumeradasDe(resto);
    t.restricciones.set(nombre, { tipo: 'check', cols: enumeradas.map((e) => e[0]), enumeradas });
  } else t.restricciones.set(nombre, { tipo: 'otra', cols: [] });
}

function agregarColumna(t, def, anonimo) {
  const m = def.match(/^"?(\w+)"?\s+(.*)$/);
  if (!m) return;
  const [, nombre, resto] = m;
  const tipo = resto.match(/^(.*?)(?=\s+(?:NOT NULL|NULL|DEFAULT|REFERENCES|PRIMARY KEY|UNIQUE|CHECK|CONSTRAINT|GENERATED|COLLATE)\b|$)/i)[1].trim();
  const base = tipo.replace(/\(.*$/, '').trim().toLowerCase().replace(/\s+/g, '_');
  const parametros = (tipo.match(/\((.*)\)/) ?? [])[1];
  const pk = /\bPRIMARY KEY\b/i.test(resto);
  const ref = (resto.match(/\bREFERENCES ([\w.]+)/i) ?? [])[1];
  t.columnas.set(nombre, {
    tipoBase: base,
    parametros,
    pk,
    noNulo: pk || /\bNOT NULL\b/i.test(resto),
    unico: /\bUNIQUE\b/i.test(resto),
    ref: ref ? nombreSimple(ref) : undefined,
  });
  const check = resto.match(/\bCHECK\s*\((.*)\)/i);
  if (check) {
    const enumeradas = enumeradasDe(check[1]);
    if (enumeradas.length) t.restricciones.set(anonimo(), { tipo: 'check', cols: [nombre], enumeradas });
  }
}

/** Aplica una acción de ALTER TABLE. Devuelve false si no la entiende, o el nombre nuevo si renombra la tabla. */
function aplicarAlter(t, accion, anonimo) {
  let m;
  if ((m = accion.match(/^ADD (?:COLUMN )?(?:IF NOT EXISTS )?(.*)$/i))) {
    agregarDefinicion(t, m[1], anonimo);
    return true;
  }
  if ((m = accion.match(/^DROP (?:COLUMN )?(?:IF EXISTS )?(\w+)(?: CASCADE| RESTRICT)?$/i)) && !/^CONSTRAINT$/i.test(m[1])) {
    t.columnas.delete(m[1]);
    for (const [n, r] of [...t.restricciones]) if (r.cols.includes(m[1])) t.restricciones.delete(n);
    return true;
  }
  if ((m = accion.match(/^DROP CONSTRAINT (?:IF EXISTS )?(\w+)/i))) {
    t.restricciones.delete(m[1]);
    return true;
  }
  if ((m = accion.match(/^ALTER (?:COLUMN )?(\w+) (.*)$/i))) {
    const c = t.columnas.get(m[1]);
    if (!c) return false;
    const que = m[2];
    if (/^DROP NOT NULL/i.test(que)) c.noNulo = false;
    else if (/^SET NOT NULL/i.test(que)) c.noNulo = true;
    else if (/^(SET DATA )?TYPE /i.test(que)) {
      const tipo = que.replace(/^(SET DATA )?TYPE /i, '').replace(/\s+USING .*$/i, '');
      c.tipoBase = tipo.replace(/\(.*$/, '').trim().toLowerCase().replace(/\s+/g, '_');
      c.parametros = (tipo.match(/\((.*)\)/) ?? [])[1];
    } else if (!/^(SET|DROP) DEFAULT/i.test(que)) return false;
    return true;
  }
  if ((m = accion.match(/^RENAME (?:COLUMN )?(\w+) TO (\w+)$/i)) && !/^CONSTRAINT$/i.test(m[1])) {
    if (/^TO$/i.test(m[1])) return false;
    const c = t.columnas.get(m[1]);
    if (!c) return false;
    t.columnas = new Map([...t.columnas].map(([k, val]) => [k === m[1] ? m[2] : k, val]));
    for (const r of t.restricciones.values()) r.cols = r.cols.map((x) => (x === m[1] ? m[2] : x));
    return true;
  }
  if ((m = accion.match(/^RENAME TO ([\w.]+)$/i))) return nombreSimple(m[1]);
  if (/^RENAME CONSTRAINT /i.test(accion)) return true;
  return false;
}

/** Columnas (alias de la lista del SELECT) y tablas de origen (FROM/JOIN) de una consulta. */
function analizarConsulta(consulta) {
  const sinParentesis = [];
  let nivel = 0;
  for (const c of consulta) {
    if (c === '(') nivel++;
    sinParentesis.push(nivel === 0 ? c : ' ');
    if (c === ')') nivel--;
  }
  const plano = sinParentesis.join('');
  const i = plano.search(/\bSELECT\b/i);
  const j = plano.slice(i).search(/\bFROM\b/i) + i;
  const lista = partir(consulta.slice(i + 6, j));
  const columnas = lista.map((item) => {
    const alias = item.match(/\bAS\s+"?(\w+)"?\s*$/i);
    return alias ? alias[1] : (item.match(/(\w+)\s*$/) ?? ['', item])[1];
  });
  const fuentes = [...new Set([...consulta.matchAll(/\b(?:FROM|JOIN)\s+([\w.]+)/gi)].map((m) => nombreSimple(m[1])))].sort(ordenar);
  return { columnas, fuentes };
}

if (esPrincipal(import.meta.url)) console.log(generar().markdown);

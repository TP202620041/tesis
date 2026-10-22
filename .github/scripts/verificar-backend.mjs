#!/usr/bin/env node
/**
 * Guarda de completitud del backend (DEP-07): prueba que se ejecutaron TODOS
 * los tests, no solo que lo ejecutado pasó. Un BUILD SUCCESS no basta: un
 * filtro mal escrito, una clase que el plugin no recogió o una suite entera
 * con @Disabled terminan en verde sin haber probado nada.
 *
 * Uso, después de `mvn clean verify` (desde cualquier carpeta):
 *   node .github/scripts/verificar-backend.mjs
 * Opcionales: MIN_IT_FAILSAFE y MIN_SUREFIRE (mínimos de tests ejecutados, sin
 * contar los omitidos), CLASES_OBLIGATORIAS (nombres simples de clases de test,
 * separados por comas, que no pueden quedar con todos sus tests omitidos: p. ej.
 * un IT que se activa por una variable de entorno que la CI sí define) y
 * GITHUB_STEP_SUMMARY (agrega la tabla en Markdown).
 *
 * Falla (sale con 1) si:
 *  - una clase de test no abstracta no tiene su TEST-<clase>.xml: Failsafe
 *    para *IT y *ITCase, Surefire para *Test, *Tests y *TestCase (los sufijos
 *    por defecto de cada plugin; los prefijos IT* y Test* no se exigen para
 *    no confundir un ayudante como TestDatos con una clase de test);
 *  - Failsafe o Surefire tienen errors o failures;
 *  - los tests ejecutados (completed - skipped) son 0 o menos que el mínimo.
 * Una clase con todos sus tests omitidos solo genera un aviso, salvo que esté en
 * CLASES_OBLIGATORIAS: entonces es un error.
 */
import { appendFileSync, existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const backend = path.join(raiz, 'backend');
const fuentes = path.join(backend, 'src', 'test', 'java');
const enActions = process.env.GITHUB_ACTIONS === 'true';
const obligatorias = new Set(
  (process.env.CLASES_OBLIGATORIAS ?? '').split(',').map((c) => c.trim()).filter(Boolean),
);
const obligatoriasVistas = new Set();

const errores = [];
const avisos = [];
const filas = [];

function archivosJava(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((entrada) => {
    const ruta = path.join(dir, entrada);
    if (statSync(ruta).isDirectory()) return archivosJava(ruta);
    return entrada.endsWith('.java') ? [ruta] : [];
  });
}

/** Atributos numéricos del <testsuite> de un informe TEST-*.xml. */
function suite(ruta) {
  const etiqueta = readFileSync(ruta, 'utf8').match(/<testsuite\b([^>]*)>/);
  const attrs = Object.fromEntries([...(etiqueta?.[1] ?? '').matchAll(/(\w+)="([^"]*)"/g)].map((m) => [m[1], m[2]]));
  const n = (k) => Number.parseInt(attrs[k] ?? '0', 10) || 0;
  return { tests: n('tests'), errors: n('errors'), failures: n('failures'), skipped: n('skipped') };
}

function minimo(variable) {
  const valor = process.env[variable];
  return valor && /^\d+$/.test(valor.trim()) ? Number(valor.trim()) : null;
}

/** Clases que el plugin debería ejecutar, sin las abstractas (AbstractPostgisIT…). */
function clasesEsperadas(patron) {
  return archivosJava(fuentes)
    .map((ruta) => ({ ruta, clase: path.basename(ruta, '.java') }))
    .filter(({ clase }) => patron.test(clase))
    .filter(({ ruta, clase }) => !new RegExp(`\\babstract\\s+class\\s+${clase}\\b`).test(readFileSync(ruta, 'utf8')))
    .map(({ ruta }) => path.relative(fuentes, ruta).replace(/\.java$/, '').split(path.sep).join('.'));
}

function revisarPlugin({ nombre, dirInformes, patron, totales, variableMinimo }) {
  const dir = path.join(backend, 'target', dirInformes);
  const esperadas = clasesEsperadas(patron);
  const faltantes = [];
  for (const fqcn of esperadas) {
    const informe = path.join(dir, `TEST-${fqcn}.xml`);
    if (!existsSync(informe)) {
      faltantes.push(fqcn);
      continue;
    }
    const s = suite(informe);
    const simple = fqcn.split('.').pop();
    if (obligatorias.has(simple)) obligatoriasVistas.add(simple);
    if (s.tests - s.skipped <= 0) {
      const mensaje = `${nombre}: ${fqcn} no ejecutó ningún test (todos omitidos o vacía).`;
      if (obligatorias.has(simple)) errores.push(`${mensaje} Está en CLASES_OBLIGATORIAS.`);
      else avisos.push(mensaje);
    }
  }
  if (faltantes.length) {
    errores.push(`${nombre}: ${faltantes.length} de ${esperadas.length} clases sin informe (no se ejecutaron): ${faltantes.join(', ')}`);
  }
  const ejecutados = totales.tests - totales.skipped;
  const min = minimo(variableMinimo);
  if (ejecutados <= 0) errores.push(`${nombre}: no se ejecutó ningún test.`);
  else if (min !== null && ejecutados < min) {
    errores.push(`${nombre}: ${ejecutados} tests ejecutados, menos que el mínimo ${variableMinimo}=${min}.`);
  }
  if (totales.errors || totales.failures) {
    errores.push(`${nombre}: ${totales.errors} errors y ${totales.failures} failures.`);
  }
  filas.push([
    `Tests ${nombre === 'Failsafe' ? 'de integración (Failsafe `completed`)' : 'unitarios (Surefire)'}`,
    `**${totales.tests}** (ejecutados ${ejecutados}${min !== null ? `, mínimo ${min}` : ''}; errors ${totales.errors}, ` +
      `failures ${totales.failures}, skipped ${totales.skipped}); clases ${esperadas.length - faltantes.length}/${esperadas.length}`,
  ]);
}

// Failsafe: los totales salen de failsafe-summary.xml, el archivo que se cita.
const resumenFailsafe = path.join(backend, 'target', 'failsafe-reports', 'failsafe-summary.xml');
let failsafe = { tests: 0, errors: 0, failures: 0, skipped: 0 };
if (existsSync(resumenFailsafe)) {
  const xml = readFileSync(resumenFailsafe, 'utf8');
  const v = (k) => Number.parseInt(xml.match(new RegExp(`<${k}>(\\d+)</${k}>`))?.[1] ?? '0', 10);
  failsafe = { tests: v('completed'), errors: v('errors'), failures: v('failures'), skipped: v('skipped') };
} else {
  errores.push('No existe target/failsafe-reports/failsafe-summary.xml: Failsafe no corrió.');
}
revisarPlugin({
  nombre: 'Failsafe',
  dirInformes: 'failsafe-reports',
  patron: /.+(IT|ITCase)$/,
  totales: failsafe,
  variableMinimo: 'MIN_IT_FAILSAFE',
});

// Surefire no deja un resumen: se suman sus informes.
const dirSurefire = path.join(backend, 'target', 'surefire-reports');
const surefire = { tests: 0, errors: 0, failures: 0, skipped: 0 };
if (existsSync(dirSurefire)) {
  for (const f of readdirSync(dirSurefire).filter((f) => /^TEST-.+\.xml$/.test(f))) {
    const s = suite(path.join(dirSurefire, f));
    for (const k of Object.keys(surefire)) surefire[k] += s[k];
  }
}
revisarPlugin({
  nombre: 'Surefire',
  dirInformes: 'surefire-reports',
  patron: /.+(Test|Tests|TestCase)$/,
  totales: surefire,
  variableMinimo: 'MIN_SUREFIRE',
});

// Cobertura (informativa).
const csv = path.join(backend, 'target', 'site', 'jacoco', 'jacoco.csv');
if (existsSync(csv)) {
  const [cabecera, ...lineas] = readFileSync(csv, 'utf8').trim().split(/\r?\n/);
  const col = Object.fromEntries(cabecera.split(',').map((c, i) => [c, i]));
  const suma = (k) => lineas.reduce((acc, l) => acc + Number(l.split(',')[col[k]]), 0);
  const pct = (tipo) => {
    const cub = suma(`${tipo}_COVERED`);
    const total = cub + suma(`${tipo}_MISSED`);
    return total ? `${((100 * cub) / total).toFixed(1)} % (${cub}/${total})` : 'n/d';
  };
  filas.push(['Cobertura de líneas (JaCoCo)', pct('LINE')], ['Cobertura de ramas (JaCoCo)', pct('BRANCH')]);
} else {
  filas.push(['Cobertura (JaCoCo)', 'sin informe']);
}

// Violaciones congeladas de ArchUnit (informativo; las nuevas ya fallan en Surefire).
let archunit = 'n/d';
try {
  const salida = execFileSync(process.execPath, [path.join(raiz, '.claude/skills/verificar/contar-archunit.mjs')], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  archunit = salida.match(/^\s*(\d+)\s+TOTAL/m)?.[1] ?? 'n/d';
} catch {
  // Sin el script o sin almacén: se informa n/d.
}
filas.push(['Violaciones congeladas de ArchUnit', archunit]);

// Una clase obligatoria que ni siquiera tiene informe (renombrada o borrada) también es un error.
for (const c of obligatorias) {
  if (!obligatoriasVistas.has(c)) errores.push(`CLASES_OBLIGATORIAS: no hay informe de ${c} en Failsafe ni en Surefire.`);
}

for (const [m, v] of filas) console.log(`${m}: ${v.replaceAll('**', '')}`);
for (const a of avisos) console.log(enActions ? `::warning::${a}` : `AVISO: ${a}`);
for (const e of errores) console.log(enActions ? `::error::${e}` : `ERROR: ${e}`);

if (process.env.GITHUB_STEP_SUMMARY) {
  const md = [
    '### Backend',
    '',
    '| Métrica | Valor |',
    '|---|---|',
    ...filas.map(([m, v]) => `| ${m} | ${v} |`),
    ...avisos.map((a) => `\n> **Aviso:** ${a}`),
    ...errores.map((e) => `\n> **Error:** ${e}`),
    '',
  ].join('\n');
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${md}\n`);
}

process.exit(errores.length ? 1 : 0);

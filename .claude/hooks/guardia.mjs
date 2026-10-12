#!/usr/bin/env node
/**
 * Guardia de propiedad y de Git para los agentes de Claude Code (WORKFLOW.md, seccion 5).
 *
 * Se ejecuta como hook PreToolUse. Recibe el JSON del evento por stdin y:
 *   - Edit/Write/MultiEdit/NotebookEdit: bloquea escribir fuera de la carpeta del
 *     agente, en archivos normativos o generados, y en migraciones ya aplicadas.
 *   - Bash/PowerShell: bloquea commits en main, push a main, push forzado y
 *     comandos git que descartan trabajo sin pedirlo.
 *
 * Uso (desde settings.json):  node <raiz>/.claude/hooks/guardia.mjs <dueno>
 *   <dueno> = raiz | backend | frontend | inferencia
 *
 * Salida: exit 0 = sin objecion (sigue el flujo normal de permisos);
 *         exit 2 = bloquear, con el motivo en stderr (Claude lo recibe y se corrige).
 *
 * Es una red de seguridad, no un sandbox: un agente decidido podria escribir con
 * un comando de shell. Por eso las reglas tambien estan en CLAUDE.md y WORKFLOW.md.
 */
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DUENOS = new Set(['raiz', 'backend', 'frontend', 'inferencia']);
const dueno = process.argv[2] ?? 'raiz';
if (!DUENOS.has(dueno)) {
  bloquear(`guardia.mjs: dueno desconocido "${dueno}". Revisa .claude/settings.json de esta carpeta.`);
}

// La raiz del repo es dos niveles arriba de este archivo (.claude/hooks/).
const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

let entrada;
try {
  entrada = JSON.parse(readFileSync(0, 'utf8'));
} catch {
  process.exit(0); // sin entrada legible no se bloquea nada
}

const herramienta = entrada.tool_name ?? '';
const cwd = entrada.cwd ?? process.cwd();

if (['Edit', 'Write', 'MultiEdit', 'NotebookEdit'].includes(herramienta)) {
  revisarEscritura(entrada.tool_input?.file_path ?? entrada.tool_input?.notebook_path);
} else if (['Bash', 'PowerShell'].includes(herramienta)) {
  revisarComando(entrada.tool_input?.command ?? '');
}
process.exit(0);

/* ------------------------------------------------------------------ */

function revisarEscritura(destino) {
  if (!destino) return;
  const absoluto = path.resolve(cwd, destino);
  const rel = path.relative(RAIZ, absoluto).split(path.sep).join('/');
  if (rel.startsWith('..') || path.isAbsolute(rel)) return; // fuera del repo (memoria, temporales)

  // 1. Generados: nadie los edita a mano, tampoco la sesion de raiz.
  if (rel.startsWith('backend/src/test/resources/archunit_store/')) {
    bloquear(`${rel} lo escribe ArchUnit. Corrige la violacion en el codigo y vuelve a correr el test; nunca edites el almacen.`);
  }
  if (rel.startsWith('frontend/src/lib/api/generated/')) {
    bloquear(`${rel} es generado. Corre "npm run api:sync" (o "api:types") y ajusta los tipos en features/<f>/model o lib/types.`);
  }

  // 2. Migraciones Flyway ya existentes: inmutables.
  if (/^backend\/src\/main\/resources\/db\/migration\/V[^/]+\.sql$/.test(rel) && existsSync(absoluto)) {
    bloquear(`${rel} ya existe y puede estar aplicada. No se edita: crea una migracion nueva con la siguiente version libre.`);
  }

  if (dueno === 'raiz') return;

  // 3. Normativos y guardas: solo la sesion de raiz.
  const soloRaiz = [
    'ARCHITECTURE.md',
    'WORKFLOW.md',
    'CLAUDE.md',
    '.claude/',
    'backend/.claude/',
    'frontend/.claude/',
    'inferencia/.claude/',
    'frontend/eslint.capas.mjs',
    'backend/src/test/resources/archunit.properties',
    'backend/src/test/java/pe/edu/upc/viasegura/arquitectura/',
  ];
  if (soloRaiz.some((p) => rel === p || (p.endsWith('/') && rel.startsWith(p)))) {
    bloquear(`${rel} es normativo o es una guarda de arquitectura: solo lo cambia la sesion de raiz. Si crees que hay que cambiarlo, usa /propuesta.`);
  }

  // 4. project-context: solo el plan (marcar tareas), handoffs y propuestas.
  const permitidosEnContexto = [
    'project-context/decisions/plan-migracion-capas.md',
    'project-context/handoffs/',
    'project-context/decisions/propuestas/',
  ];
  if (rel.startsWith('project-context/')) {
    if (permitidosEnContexto.some((p) => rel === p || (p.endsWith('/') && rel.startsWith(p)))) return;
    bloquear(`${rel}: en project-context/ el agente solo escribe el plan, handoffs/ y decisions/propuestas/.`);
  }

  // 5. Carpeta propia.
  if (!rel.startsWith(`${dueno}/`)) {
    bloquear(`Esta sesion es del agente de ${dueno}/ y ${rel} es de otro dueno. Si necesitas un cambio alla, deja un handoff (/contrato) o una propuesta (/propuesta).`);
  }
}

function revisarComando(comando) {
  const c = comando.replace(/\s+/g, ' ');
  if (!/\bgit\b/.test(c)) return;

  if (/\bgit (-C \S+ )?push\b/.test(c)) {
    if (/(--force\b|-f\b|--force-with-lease\b)/.test(c)) {
      bloquear('Push forzado bloqueado. Si de verdad hace falta, que lo haga el usuario.');
    }
    const aMain = /\bpush\b[^|;&]*(\s|:)(main|master)(\s|$|[|;&])/.test(c);
    const sinDestinoDesdeMain = /\bpush( -u| --set-upstream)?( origin)?\s*($|[|;&])/.test(c) && ramaActual() === 'main';
    if (aMain || sinDestinoDesdeMain) {
      bloquear('Nadie hace push a main. Sube tu rama (git push -u origin <rama>) y abre un PR.');
    }
  }

  if (/\bgit (-C \S+ )?commit\b/.test(c) && ramaActual() === 'main') {
    bloquear('Estas en main. Cada tarea va en su rama: usa /tarea <ID> o "git switch -c <tipo>/<id>".');
  }

  if (dueno !== 'raiz') {
    const destructivos = [
      /\bgit reset --hard\b/,
      /\bgit clean -[a-z]*f/,
      /\bgit checkout (-- )?\.(\s|$)/,
      /\bgit restore (--staged )?\.(\s|$)/,
      /\bgit stash (drop|clear)\b/,
      /\bgit branch -D\b/,
    ];
    if (destructivos.some((r) => r.test(c))) {
      bloquear('Comando git que descarta trabajo. Explica al usuario que quieres descartar y deja que el lo ejecute.');
    }
    if (/\bgit (checkout|restore)\b[^|;&]*(ARCHITECTURE\.md|WORKFLOW\.md|project-context\/)/.test(c)) {
      bloquear('No restaures documentos normativos ni project-context/ desde git: los mantiene la sesion de raiz.');
    }
  }
}

function ramaActual() {
  try {
    return execFileSync('git', ['branch', '--show-current'], { cwd, encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
}

function bloquear(motivo) {
  process.stderr.write(`[guardia] ${motivo}\n`);
  process.exit(2);
}

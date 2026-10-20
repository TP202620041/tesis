/**
 * Utilidades compartidas por los extractores de /diagramas.
 * Solo node:fs y node:path: nada de dependencias nuevas.
 */
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Raíz del repo: tres niveles arriba de .claude/skills/diagramas/. */
export const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

/** Orden estable e independiente del sistema: comparación por código de carácter. */
export const ordenar = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/** Lee un archivo de texto con fin de línea normalizado a \n. */
export function leer(ruta) {
  return readFileSync(ruta, 'utf8').replace(/\r\n/g, '\n');
}

/** Lista recursiva de archivos (rutas relativas a `base`, con /), en orden alfabético. */
export function archivos(base, filtro = () => true) {
  const salida = [];
  if (!existsSync(base)) return salida;
  const recorrer = (dir) => {
    for (const nombre of readdirSync(dir).sort(ordenar)) {
      const abs = path.join(dir, nombre);
      if (statSync(abs).isDirectory()) recorrer(abs);
      else {
        const rel = path.relative(base, abs).split(path.sep).join('/');
        if (filtro(rel)) salida.push(rel);
      }
    }
  };
  recorrer(base);
  return salida;
}

/** Subcarpetas directas, en orden alfabético. */
export function carpetas(base) {
  if (!existsSync(base)) return [];
  return readdirSync(base)
    .filter((n) => statSync(path.join(base, n)).isDirectory())
    .sort(ordenar);
}

/** Identificador seguro para Mermaid a partir de cualquier texto. */
export function idMermaid(prefijo, texto) {
  return `${prefijo}_${texto.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '')}`;
}

/** Escapa comillas dobles dentro de una etiqueta Mermaid entre comillas. */
export const etiqueta = (t) => t.replace(/"/g, '#quot;');

/** ¿Este módulo se está ejecutando como script (node archivo.mjs)? */
export function esPrincipal(metaUrl) {
  return process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(metaUrl);
}

/**
 * Lee la tabla de §4.3 de ARCHITECTURE.md: módulos, "Usa a" y estado, más la
 * lista de subpaquetes públicos e internos. Devuelve null si no la encuentra.
 */
export function leerNormaModulos(raiz = RAIZ) {
  const ruta = path.join(raiz, 'ARCHITECTURE.md');
  if (!existsSync(ruta)) return null;
  const texto = leer(ruta);
  const inicio = texto.indexOf('### 4.3');
  if (inicio < 0) return null;
  const resto = texto.slice(inicio + 7);
  const fin = resto.search(/\n#{2,3} /);
  const seccion = fin < 0 ? resto : resto.slice(0, fin);

  const entre = (desde, hasta) => {
    const i = seccion.indexOf(desde);
    if (i < 0) return [];
    const trozo = seccion.slice(i + desde.length);
    const j = trozo.indexOf(hasta);
    return [...(j < 0 ? trozo : trozo.slice(0, j)).matchAll(/`([a-z]+)`/g)].map((m) => m[1]);
  };
  const publicos = entre('API pública**', 'Nunca');
  const internos = entre('Nunca su', '.');

  const filas = seccion.split('\n').filter((l) => l.trim().startsWith('|'));
  if (filas.length < 3) return null;
  const columnas = filas[0].split('|').map((c) => c.trim());
  const iModulo = columnas.findIndex((c) => /^m[oó]dulo$/i.test(c));
  const iUsa = columnas.findIndex((c) => /^usa a$/i.test(c));
  const iEstado = columnas.findIndex((c) => /^estado$/i.test(c));
  if (iModulo < 0 || iUsa < 0) return null;

  const modulos = new Map();
  for (const fila of filas.slice(2)) {
    const celdas = fila.split('|').map((c) => c.trim());
    const nombre = (celdas[iModulo] ?? '').replace(/`/g, '').trim();
    if (!nombre) continue;
    const usa = new Map(); // destino -> null (cualquier subpaquete público) | Set de subpaquetes
    for (const parte of (celdas[iUsa] ?? '').split(',')) {
      const m = parte.trim().match(/^`?([a-z]+)`?\s*(?:\(([^)]*)\))?$/);
      if (!m) continue;
      usa.set(m[1], m[2] ? new Set(m[2].split(/[,\s]+/).filter(Boolean)) : null);
    }
    const estado = (celdas[iEstado] ?? '').replace(/\*/g, '').trim();
    modulos.set(nombre, { usa, estado });
  }
  return {
    publicos: publicos.length ? publicos : ['service', 'domain', 'event', 'port', 'dto'],
    internos: internos.length ? internos : ['controller', 'listener', 'repository', 'infra'],
    modulos,
  };
}

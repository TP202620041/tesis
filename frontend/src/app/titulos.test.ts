import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * QA-1 M-8: cada ruta tiene su propio `<title>`, que es ademas lo que lee el
 * anunciador de rutas de Next al navegar. Diez pantallas compartian «Ciudad
 * Viva — Reporte ciudadano de daños viales» y un lector de pantalla anunciaba
 * lo mismo en cada navegacion.
 *
 * Se comprueba leyendo los archivos (como `manifest.test.ts`), sin montar
 * Next: el titulo de una ruta es el `title` de su `page.tsx` o, si la pagina
 * es de cliente (no puede exportar `metadata`), el del `layout.tsx` mas
 * cercano por encima, sin contar el raiz (su titulo es el de por defecto).
 */
const APP = dirname(fileURLToPath(import.meta.url));

function paginas(dir: string): string[] {
  return readdirSync(dir).flatMap((entrada) => {
    const ruta = join(dir, entrada);
    if (statSync(ruta).isDirectory()) return paginas(ruta);
    return entrada === 'page.tsx' ? [ruta] : [];
  });
}

function tituloDe(archivo: string): string | null {
  if (!existsSync(archivo)) return null;
  const texto = readFileSync(archivo, 'utf8');
  if (!/export const metadata/.test(texto)) return null;
  // `title: 'X'` o `title: { default: 'X', template: … }`.
  return /title:\s*(?:\{\s*default:\s*)?'([^']+)'/.exec(texto)?.[1] ?? null;
}

/** `true` si el archivo vuelve a declarar la plantilla del titulo. */
function declaraPlantilla(archivo: string): boolean {
  return /template:\s*PLANTILLA_TITULO/.test(readFileSync(archivo, 'utf8'));
}

/** Layouts con titulo entre la pagina y el raiz (sin contarlo), del mas cercano al mas lejano. */
function layoutsConTitulo(pagina: string): string[] {
  const layouts: string[] = [];
  for (let dir = dirname(pagina); dir !== APP && dir.startsWith(APP); dir = dirname(dir)) {
    const layout = join(dir, 'layout.tsx');
    if (tituloDe(layout)) layouts.push(layout);
  }
  return layouts;
}

/** Titulo efectivo de una pagina: el suyo o el del layout mas cercano (sin el raiz). */
function tituloEfectivo(pagina: string): string | null {
  const propio = tituloDe(pagina);
  if (propio) return propio;
  for (let dir = dirname(pagina); dir !== APP && dir.startsWith(APP); dir = dirname(dir)) {
    const delLayout = tituloDe(join(dir, 'layout.tsx'));
    if (delLayout) return delLayout;
  }
  return null;
}

/** `/(public)/mapa` → `/mapa` (los grupos no forman parte de la URL). */
function url(pagina: string): string {
  const segmentos = relative(APP, dirname(pagina))
    .split(/[\\/]/)
    .filter((s) => s && !/^\(.*\)$/.test(s));
  return `/${segmentos.join('/')}`;
}

describe('títulos de página (QA-1 M-8)', () => {
  const rutas = paginas(APP)
    .filter((p) => resolve(p) !== resolve(APP, 'page.tsx'))
    .map((p) => ({ url: url(p), titulo: tituloEfectivo(p) }));

  it('encuentra las rutas de la app', () => {
    expect(rutas.map((r) => r.url)).toEqual(expect.arrayContaining(['/mapa', '/reportes/[id]', '/bandeja']));
  });

  it.each(['/mapa', '/desempeno', '/reportar', '/mis-reportes', '/perfil', '/soporte', '/bandeja', '/dashboard', '/categorias', '/reportes/[id]'])(
    '%s tiene título propio',
    (ruta) => {
      expect(rutas.find((r) => r.url === ruta)?.titulo).toBeTruthy();
    },
  );

  it('ninguna ruta se queda con el título por defecto', () => {
    expect(rutas.filter((r) => !r.titulo).map((r) => r.url)).toEqual([]);
  });

  it('no hay dos rutas con el mismo título', () => {
    const titulos = rutas.map((r) => r.titulo);
    expect(new Set(titulos).size).toBe(titulos.length);
  });

  it('una ruta anidada conserva «· Ciudad Viva»: el layout padre con título repite la plantilla', () => {
    // En Next, un layout que fija `title` como texto deja a sus hijos sin
    // plantilla: `/bandeja/[id]` salía «Gestión del reporte» a secas.
    const sinPlantilla = paginas(APP).flatMap((p) =>
      layoutsConTitulo(p)
        .slice(1)
        .filter((padre) => !declaraPlantilla(padre))
        .map((padre) => `${url(p)} ← ${relative(APP, padre)}`),
    );
    expect(sinPlantilla).toEqual([]);
  });

  it('la 404 también tiene el suyo', () => {
    expect(tituloDe(join(APP, 'not-found.tsx'))).toBe('Página no encontrada');
  });
});

/**
 * Plantilla del `<title>` de las rutas: «Mapa de reportes · Ciudad Viva».
 *
 * La define el layout raiz, y la vuelve a declarar todo layout con titulo
 * que tenga rutas hijas con titulo propio (QA-1 M-8): en Next, un layout que
 * fija `title` como texto deja a sus hijos SIN plantilla, y `/bandeja/[id]`
 * salia «Gestión del reporte» a secas. `titulos.test.ts` lo comprueba.
 */
export const PLANTILLA_TITULO = '%s · Ciudad Viva';

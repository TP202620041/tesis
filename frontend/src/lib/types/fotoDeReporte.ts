/**
 * QA-1 M-3: reemplazo de una foto de reporte que no se puede cargar. Reglas
 * puras que comparten `components/FotoDeReporte.tsx` (detalles y listas) y el
 * popup de `map/MapaReportes.tsx`, que no importa componentes compartidos:
 * `map/` solo depende de `model/` y `lib/` (ARCHITECTURE §5.3).
 */

/** Texto visible del reemplazo. */
export const FOTO_NO_DISPONIBLE = 'Foto no disponible';

/**
 * Nombre accesible del reemplazo: el mismo texto alternativo de la foto mas
 * el aviso, para que un lector de pantalla siga sabiendo de que era la foto.
 * `null` si la foto era decorativa (`alt` vacio): el reemplazo tambien lo es.
 */
export function nombreDelReemplazo(alt: string): string | null {
  return alt.trim() === '' ? null : `${alt} (${FOTO_NO_DISPONIBLE.toLowerCase()})`;
}

/**
 * Reglas puras de la edición de un reporte (US-08) frente a categorías
 * desactivadas (US-29).
 *
 * Desactivar una categoría solo deja de ofrecerla: los reportes que ya la
 * tienen la conservan. El catálogo público ya no la trae, así que el
 * selector la perdería y mostraría otra como elegida. Aquí se la vuelve a
 * agregar como opción, y la petición solo lleva `categoriaId` si el
 * ciudadano eligió otra (el PATCH de US-08 es parcial: lo ausente no cambia).
 */
import type { CategoriaDano } from '@/lib/types/domain';

export interface OpcionCategoria {
  id: number;
  nombre: string;
  /** `true` = es la del reporte y ya no se ofrece (desactivada). */
  noOfrecida: boolean;
}

/**
 * Opciones del selector: las del catálogo y, si la categoría actual del
 * reporte no está entre ellas, esa al principio, marcada.
 */
export function opcionesDeCategoria(
  catalogo: readonly CategoriaDano[],
  actual: { id: number | null; nombre: string | null },
): OpcionCategoria[] {
  const opciones = catalogo.map((c) => ({ id: c.id, nombre: c.nombre, noOfrecida: false }));
  if (actual.id == null || opciones.some((o) => o.id === actual.id)) return opciones;
  // Con el catálogo vacío (cargando o sin red) no se sabe si se desactivó:
  // se muestra la actual sin marcarla.
  const nombre = actual.nombre ?? 'Categoría actual';
  return [{ id: actual.id, nombre, noOfrecida: opciones.length > 0 }, ...opciones];
}

export function etiquetaDeOpcion(opcion: OpcionCategoria): string {
  return opcion.noOfrecida ? `${opcion.nombre} (ya no se ofrece)` : opcion.nombre;
}

/** Cuerpo del PATCH de US-08: `categoriaId` solo si cambió. */
export function cambiosDeEdicion(
  categoriaOriginal: number | null,
  categoriaElegida: number | null,
  descripcion: string,
): { categoriaId?: number; descripcion: string } {
  if (categoriaElegida != null && categoriaElegida !== categoriaOriginal) {
    return { categoriaId: categoriaElegida, descripcion };
  }
  return { descripcion };
}

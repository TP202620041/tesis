/**
 * Reglas puras de la edición de un reporte (US-08) frente a categorías
 * desactivadas (US-29), con título y severidad (NC-02).
 *
 * Desactivar una categoría solo deja de ofrecerla: los reportes que ya la
 * tienen la conservan. El catálogo público ya no la trae, así que el
 * selector la perdería y mostraría otra como elegida. Aquí se la vuelve a
 * agregar como opción, y la petición solo lleva `categoriaId` si el
 * ciudadano eligió otra (el PATCH de US-08 es parcial: lo ausente no cambia).
 */
import type { CategoriaDano, Severidad } from '@/lib/types/domain';
import { errorDelTitulo } from './titulo';

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

/** Lo que el ciudadano dejó en el formulario de edición. */
export interface EdicionElegida {
  categoriaId: number | null;
  /** NC-02. */
  titulo: string;
  /** NC-02. */
  severidad: Severidad | null;
  descripcion: string;
}

/** Valores actuales del reporte, para saber qué cambió. */
export interface ValoresOriginales {
  categoriaId: number | null;
  titulo: string | null;
  severidad: string | null;
}

export interface CambiosDeEdicion {
  categoriaId?: number;
  titulo?: string;
  severidad?: Severidad;
  descripcion: string;
}

/**
 * Cuerpo del PATCH de US-08. La descripción va siempre (como antes); la
 * categoría, el título y la severidad (NC-02) solo si cambiaron: en el PATCH
 * lo ausente no cambia, y así un título que el ciudadano no tocó nunca
 * provoca un 400. El título se compara y se envía recortado, como lo guarda
 * el backend.
 */
export function cambiosDeEdicion(
  original: ValoresOriginales,
  elegido: EdicionElegida,
): CambiosDeEdicion {
  const cambios: CambiosDeEdicion = { descripcion: elegido.descripcion };
  if (elegido.categoriaId != null && elegido.categoriaId !== original.categoriaId) {
    cambios.categoriaId = elegido.categoriaId;
  }
  const titulo = elegido.titulo.trim();
  if (titulo !== (original.titulo ?? '').trim()) cambios.titulo = titulo;
  if (elegido.severidad != null && elegido.severidad !== original.severidad) {
    cambios.severidad = elegido.severidad;
  }
  return cambios;
}

/**
 * Error que impide guardar, o `null`. Solo se valida el título si cambió:
 * el que ya tiene el reporte lo validó el backend.
 */
export function errorDeEdicion(cambios: CambiosDeEdicion): string | null {
  return cambios.titulo === undefined ? null : errorDelTitulo(cambios.titulo);
}

/**
 * Gestión de categorías personalizadas del distrito (US-29). Puro.
 *
 * Decisión del usuario: desactivar solo hace que la categoría deje de
 * ofrecerse al reportar (los reportes que ya la tienen no cambian), se puede
 * reactivar, y las 6 estándar no se gestionan (solo lectura).
 */
import type { components } from '@/lib/api/generated/schema';

/** Respuesta cruda; solo `api.ts` la usa. */
export type CategoriaGestionResponse = components['schemas']['CategoriaGestionResponse'];

/** Categoría en la pantalla de gestión, con la nulabilidad del handoff. */
export interface CategoriaGestion {
  id: number;
  nombre: string;
  descripcion: string | null;
  esEstandar: boolean;
  activo: boolean;
  /** `null` en las estándar. */
  distritoId: number | null;
  distritoNombre: string | null;
}

/** Lo que se escribe en el formulario de crear/editar. */
export interface DatosCategoria {
  nombre: string;
  descripcion: string;
}

export const MAX_NOMBRE_CATEGORIA = 100;
export const MAX_DESCRIPCION_CATEGORIA = 300;

/** Separa las estándar (solo lectura) de las propias del distrito. */
export function separarCategorias(lista: readonly CategoriaGestion[]): {
  estandar: CategoriaGestion[];
  propias: CategoriaGestion[];
} {
  return {
    estandar: lista.filter((c) => c.esEstandar),
    propias: lista.filter((c) => !c.esEstandar),
  };
}

/** Errores del formulario; vacío = se puede enviar. Replica los `@Size` del backend. */
export function erroresDeCategoria({ nombre, descripcion }: DatosCategoria): string[] {
  const errores: string[] = [];
  const n = nombre.trim();
  if (!n) errores.push('Escribe el nombre de la categoría.');
  else if (n.length > MAX_NOMBRE_CATEGORIA) {
    errores.push(`El nombre admite hasta ${MAX_NOMBRE_CATEGORIA} caracteres.`);
  }
  if (descripcion.trim().length > MAX_DESCRIPCION_CATEGORIA) {
    errores.push(`La descripción admite hasta ${MAX_DESCRIPCION_CATEGORIA} caracteres.`);
  }
  return errores;
}

/**
 * Cuerpo de `POST /api/categorias` y de `PATCH /api/categorias/{id}`.
 *
 * Ojo: el PATCH de categoría **reemplaza** nombre y descripción (al revés
 * que el de reporte, US-08). Por eso se envían siempre los dos: una
 * descripción vacía viaja como `null` y deja la categoría sin descripción,
 * que es justo lo que quiso quien la borró del formulario.
 */
export function cuerpoDeCategoria({ nombre, descripcion }: DatosCategoria): {
  nombre: string;
  descripcion: string | null;
} {
  return { nombre: nombre.trim(), descripcion: descripcion.trim() || null };
}

/** Valores iniciales del formulario de edición. */
export function datosDe(categoria: CategoriaGestion): DatosCategoria {
  return { nombre: categoria.nombre, descripcion: categoria.descripcion ?? '' };
}

export function etiquetaDeActiva(activo: boolean): string {
  return activo ? 'Activa' : 'Inactiva';
}

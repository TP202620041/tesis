/**
 * Gestión de categorías personalizadas del distrito (US-29). Puro.
 *
 * Decisión del usuario: desactivar solo hace que la categoría deje de
 * ofrecerse al reportar (los reportes que ya la tienen no cambian), se puede
 * reactivar, y las estándar no se gestionan (solo lectura).
 *
 * US-29 Esc. 1: cada categoría puede llevar un ícono de un conjunto cerrado
 * (`IconoCategoria`); el funcionario lo elige al crear o editar la suya.
 */
import type { components } from '@/lib/api/generated/schema';
import { esIconoCategoria, type IconoCategoria } from '@/lib/types/iconoCategoria';

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
  /** `null` = sin ícono (se muestra el genérico). */
  icono: IconoCategoria | null;
}

/** Lo que se escribe en el formulario de crear/editar. */
export interface DatosCategoria {
  nombre: string;
  descripcion: string;
  /** `null` = sin ícono. */
  icono: IconoCategoria | null;
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
export function erroresDeCategoria({ nombre, descripcion, icono }: DatosCategoria): string[] {
  const errores: string[] = [];
  const n = nombre.trim();
  if (!n) errores.push('Escribe el nombre de la categoría.');
  else if (n.length > MAX_NOMBRE_CATEGORIA) {
    errores.push(`El nombre admite hasta ${MAX_NOMBRE_CATEGORIA} caracteres.`);
  }
  if (descripcion.trim().length > MAX_DESCRIPCION_CATEGORIA) {
    errores.push(`La descripción admite hasta ${MAX_DESCRIPCION_CATEGORIA} caracteres.`);
  }
  // El backend responde 400 fuera del conjunto; el selector solo ofrece los válidos.
  if (icono !== null && !esIconoCategoria(icono)) errores.push('Elige un ícono de la lista.');
  return errores;
}

/**
 * Cuerpo de `POST /api/categorias` y de `PATCH /api/categorias/{id}`.
 *
 * Ojo: el PATCH de categoría **reemplaza** nombre, descripción e ícono (al
 * revés que el de reporte, US-08). Por eso se envían siempre: una
 * descripción vacía viaja como `null` y deja la categoría sin descripción,
 * que es justo lo que quiso quien la borró del formulario. El ícono sigue la
 * misma regla (handoff `2026-11-23-cierre-mvp-backend.md`: omitirlo lo
 * quita), así que «Sin ícono» viaja como `null` y uno elegido siempre va.
 */
export function cuerpoDeCategoria({ nombre, descripcion, icono }: DatosCategoria): {
  nombre: string;
  descripcion: string | null;
  icono: IconoCategoria | null;
} {
  return { nombre: nombre.trim(), descripcion: descripcion.trim() || null, icono };
}

/** Valores iniciales del formulario de edición (con su ícono, para no quitarlo sin querer). */
export function datosDe(categoria: CategoriaGestion): DatosCategoria {
  return {
    nombre: categoria.nombre,
    descripcion: categoria.descripcion ?? '',
    icono: categoria.icono,
  };
}

export function etiquetaDeActiva(activo: boolean): string {
  return activo ? 'Activa' : 'Inactiva';
}

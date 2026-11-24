/**
 * US-29 / US-34: ícono de una categoría de daño (`IconoCategoria` del
 * backend, handoff `2026-11-23-cierre-mvp-backend.md`). Enum cerrado: el
 * funcionario lo elige al crear o editar su categoría y el servidor responde
 * 400 con un valor fuera de la lista. Puede faltar (`null`): entonces se
 * muestra un ícono genérico.
 *
 * Vive en `lib/types` porque lo usan `reportes` (formulario y filtros),
 * `gestion` (categorías propias) y el componente compartido
 * `components/ui/IconoDeCategoria`.
 *
 * Puro: sin React ni I/O.
 */
export const ICONOS_CATEGORIA = [
  'BACHE',
  'GRIETA',
  'VEREDA',
  'SEMAFORO',
  'SENALIZACION',
  'CICLOVIA',
  'DRENAJE',
  'ILUMINACION',
  'BARANDA',
  'PUENTE',
  'ARBOL',
  'ESCOMBROS',
  'OBRA',
  'OTRO',
] as const;
export type IconoCategoria = (typeof ICONOS_CATEGORIA)[number];

export function esIconoCategoria(valor: unknown): valor is IconoCategoria {
  return typeof valor === 'string' && (ICONOS_CATEGORIA as readonly string[]).includes(valor);
}

/** Lo que llega del API → el ícono, o `null` si falta o no se conoce (ícono genérico). */
export function iconoDeCategoria(valor: string | null | undefined): IconoCategoria | null {
  return esIconoCategoria(valor) ? valor : null;
}

/** Nombre de cada ícono para el selector del funcionario y los lectores de pantalla. */
export const ETIQUETA_DE_ICONO: Readonly<Record<IconoCategoria, string>> = {
  BACHE: 'Bache',
  GRIETA: 'Grieta',
  VEREDA: 'Vereda',
  SEMAFORO: 'Semáforo',
  SENALIZACION: 'Señalización',
  CICLOVIA: 'Ciclovía',
  DRENAJE: 'Drenaje',
  ILUMINACION: 'Iluminación',
  BARANDA: 'Baranda',
  PUENTE: 'Puente',
  ARBOL: 'Árbol',
  ESCOMBROS: 'Escombros',
  OBRA: 'Obra',
  OTRO: 'Otro',
};

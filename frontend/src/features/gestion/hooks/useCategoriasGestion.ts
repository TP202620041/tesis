'use client';

import { useCarga } from '@/lib/hooks/useCarga';
import { categoriasDeGestion } from '../api';
import type { CategoriaGestion } from '../model/categorias';

/** US-29: categorías del distrito del funcionario, incluidas las inactivas. */
export function useCategoriasGestion() {
  return useCarga<CategoriaGestion[]>(() => categoriasDeGestion(), []);
}

'use client';

import { useCarga } from '@/lib/hooks/useCarga';
import { bandejaDeModeracion } from '../api';
import type { FiltrosDeModeracion, PaginaDeModeracion } from '../model/tipos';

/** NC-11b: una pagina de la bandeja de moderacion del ADMIN, segun la vista y la pagina. */
export function useBandejaModeracion(filtros: FiltrosDeModeracion) {
  return useCarga<PaginaDeModeracion>(() => bandejaDeModeracion(filtros), [filtros.vista, filtros.pagina]);
}

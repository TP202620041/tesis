'use client';

import { useSearchParams } from 'next/navigation';
import { useCallback, useMemo } from 'react';
import type { FiltrosMapa } from '../model/bbox';
import {
  depurarFiltros,
  leerEstadoDelMapa,
  rutaDelMapa,
  type EstadoDelMapa,
  type VistaResultados,
} from '../model/estadoDelMapa';

/** Ids de un catalogo, o `null` si todavia no hay nada con que depurar. */
function idsConocidos(catalogo: readonly { id: number }[]): number[] | null {
  return catalogo.length > 0 ? catalogo.map((c) => c.id) : null;
}

/**
 * QA-1 M-9: filtros y vista de `/mapa` guardados en la URL. Volver del
 * detalle (Atras o «← Volver al mapa») devuelve la misma vista filtrada, y la
 * direccion se puede compartir.
 *
 * Se escribe con `window.history.replaceState`, que Next integra con su
 * router (`useSearchParams` se actualiza) sin navegar: cambiar un filtro no
 * pide nada al servidor ni vuelve a montar el mapa, que conserva su encuadre.
 * `replace` y no `push`, como la comparacion de `/desempeno`: cada filtro no
 * deberia ser una entrada que el boton Atras recorra una por una.
 *
 * `filtros` conserva su identidad mientras la URL no cambie (se memoriza por
 * el texto de la query): `useBusquedaMapa` la usa como dependencia de su
 * debounce. `useSearchParams` exige un limite de `Suspense` por encima (lo
 * pone la pagina).
 *
 * Los catalogos depuran lo que una URL editada a mano trae y no existe. Uno
 * vacio (todavia cargando, o que fallo) no depura: no se sabe que es valido.
 */
export function useEstadoDelMapaEnUrl(
  distritos: readonly { id: number }[],
  categorias: readonly { id: number }[],
) {
  const params = useSearchParams();
  const query = params.toString();
  const claveDistritos = idsConocidos(distritos)?.join(',') ?? null;
  const claveCategorias = idsConocidos(categorias)?.join(',') ?? null;

  const estado = useMemo<EstadoDelMapa>(() => {
    const leido = leerEstadoDelMapa(new URLSearchParams(query));
    const comoIds = (clave: string | null) => (clave === null ? null : clave.split(',').map(Number));
    return {
      ...leido,
      filtros: depurarFiltros(leido.filtros, comoIds(claveDistritos), comoIds(claveCategorias)),
    };
  }, [query, claveDistritos, claveCategorias]);

  const escribir = useCallback((nuevo: EstadoDelMapa) => {
    window.history.replaceState(null, '', rutaDelMapa(nuevo));
  }, []);

  const cambiarFiltros = useCallback(
    (filtros: FiltrosMapa) => escribir({ ...estado, filtros }),
    [estado, escribir],
  );
  const cambiarVista = useCallback(
    (vista: VistaResultados) => escribir({ ...estado, vista }),
    [estado, escribir],
  );

  return {
    filtros: estado.filtros,
    vista: estado.vista,
    /** `/mapa?…` de lo que se ve ahora: a donde vuelve el detalle. */
    ruta: rutaDelMapa(estado),
    cambiarFiltros,
    cambiarVista,
  };
}

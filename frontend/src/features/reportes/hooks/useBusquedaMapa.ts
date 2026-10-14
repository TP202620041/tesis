'use client';

import { useCallback, useEffect, useState } from 'react';
import { useCarga } from '@/lib/hooks/useCarga';
import { buscarReportes } from '../api';
import {
  construirQuery,
  esBboxValido,
  requiereNuevaConsulta,
  validarFiltrosMapa,
  MAXIMO_MARCADORES,
  type BoundingBox,
  type FiltrosMapa,
} from '../model/bbox';
import type { PaginaReportes } from '../model/tipos';

/** Cuanta calma esperar tras el ultimo gesto o cambio de filtro antes de consultar. */
export const ESPERA_MS = 400;

const SIN_RESULTADOS: PaginaReportes = { contenido: [], total: 0 };

/**
 * US-10/US-12: reportes del area visible del mapa con los filtros del panel.
 * Lo usan el mapa y la vista de lista, que muestran la MISMA consulta.
 *
 * - **Area**: el mapa avisa con `alCambiarArea` cada vez que termina un
 *   gesto; solo se adopta si cambio lo suficiente (`requiereNuevaConsulta`).
 * - **Debounce**: la consulta efectiva se fija `ESPERA_MS` despues del ultimo
 *   cambio de area o filtros; el temporizador con limpieza agrupa arrastres
 *   y zooms seguidos en una sola peticion.
 * - **Validacion**: con un rango de fechas invertido no se consulta; se
 *   devuelve `errorFiltros` y se conservan los resultados anteriores.
 * - **Carga**: `useCarga` descarta las respuestas viejas y traduce el error
 *   con `mensajeDeError` (p. ej. el 400 del backend ante fechas invalidas).
 *   Mientras llega una consulta nueva se siguen mostrando los resultados
 *   anteriores, para que los marcadores no parpadeen en cada gesto.
 */
export function useBusquedaMapa(filtros: FiltrosMapa) {
  // Area visible. Es estado, no ref: cambiarla es lo que dispara la consulta.
  const [area, setArea] = useState<BoundingBox | null>(null);
  const alCambiarArea = useCallback((bbox: BoundingBox) => {
    setArea((anterior) => (requiereNuevaConsulta(anterior, bbox) ? bbox : anterior));
  }, []);

  const errorFiltros = validarFiltrosMapa(filtros);

  // Query efectiva, ya debounced. `null` hasta que el mapa informe un area.
  const [consulta, setConsulta] = useState<string | null>(null);
  useEffect(() => {
    if (!esBboxValido(area) || errorFiltros) return;
    const query = construirQuery(area, filtros, MAXIMO_MARCADORES);
    const temporizador = setTimeout(() => setConsulta(query), ESPERA_MS);
    return () => clearTimeout(temporizador);
  }, [area, filtros, errorFiltros]);

  const carga = useCarga<PaginaReportes | null>(
    () => (consulta ? buscarReportes(consulta) : Promise.resolve(null)),
    [consulta],
  );

  // Ultimos resultados recibidos: se ajusta durante el render (patron de
  // "estado derivado" de React), no en un efecto.
  const [ultimos, setUltimos] = useState<PaginaReportes>(SIN_RESULTADOS);
  if (carga.estado === 'listo' && carga.datos && carga.datos !== ultimos) {
    setUltimos(carga.datos);
  }

  return {
    reportes: ultimos.contenido,
    total: ultimos.total,
    cargando: consulta !== null && carga.estado === 'cargando',
    error: carga.estado === 'error' ? carga.error.mensaje : null,
    errorFiltros,
    /** Cambia con cada consulta nueva: sirve de `key` para reiniciar la paginacion de la lista. */
    claveConsulta: consulta ?? '',
    alCambiarArea,
  };
}

'use client';

import { useEffect, useMemo, useState } from 'react';
import { useCarga } from '@/lib/hooks/useCarga';
import { densidadDeReportes } from '../api';
import type { BoundingBox, FiltrosMapa } from '../model/bbox';
import { capaDeCalor, consultaDeDensidad, type CapaDeCalor } from '../model/densidad';
import type { DensidadReportes } from '../model/tipos';
import { ESPERA_MS } from './useBusquedaMapa';

const CAPA_VACIA: CapaDeCalor = { celdas: [], maximo: 0, totalEnVista: 0, leyenda: [] };

/**
 * US-11: capa de calor del mapa publico, con los mismos filtros del panel.
 *
 * - **Solo con la capa encendida** se pide algo: apagada, la consulta es
 *   `null` y `useCarga` no llama al API.
 * - **Cuando volver a consultar**: solo si cambian los filtros
 *   (`consultaDeDensidad`). La respuesta cubre toda Lima, asi que mover o
 *   acercar el mapa NO consulta: `area` solo sirve para recalcular, en
 *   memoria, que celdas se ven y la escala relativa al maximo de la vista.
 * - **Debounce**: el mismo `ESPERA_MS` que la busqueda de marcadores, sobre
 *   los cambios de filtros (p. ej. teclear una fecha). La consulta se sigue
 *   calculando con la capa apagada (sin pedir nada), para que al encenderla
 *   salga de inmediato con los filtros vigentes.
 * - **Cache**: repetir una consulta (apagar y encender) la resuelve el
 *   navegador con el `max-age`/`ETag` del backend; aqui no hay cache propia.
 * - Mientras llega una consulta nueva se sigue mostrando la anterior, para
 *   que la capa no parpadee al cambiar un filtro.
 */
export function useDensidadMapa(filtros: FiltrosMapa, activa: boolean, area: BoundingBox | null) {
  // Consulta efectiva de los filtros, ya debounced. `null` = todavia no hay.
  const [consulta, setConsulta] = useState<string | null>(null);
  useEffect(() => {
    const siguiente = consultaDeDensidad(filtros);
    // Filtros invalidos: no se consulta y se conserva lo anterior (el panel
    // ya muestra el aviso).
    if (siguiente === null) return;
    const temporizador = setTimeout(() => setConsulta(siguiente), ESPERA_MS);
    return () => clearTimeout(temporizador);
  }, [filtros]);

  const pedida = activa ? consulta : null;
  const carga = useCarga<DensidadReportes | null>(
    () => (pedida !== null ? densidadDeReportes(pedida) : Promise.resolve(null)),
    [pedida],
  );

  // Ultima densidad recibida (estado derivado durante el render, como en
  // `useBusquedaMapa`). Al apagar la capa se descarta: lo que se vuelva a
  // mostrar al encenderla debe venir de una consulta con los filtros de ese
  // momento.
  const [ultima, setUltima] = useState<DensidadReportes | null>(null);
  if (!activa && ultima !== null) {
    setUltima(null);
  } else if (activa && carga.estado === 'listo' && carga.datos && carga.datos !== ultima) {
    setUltima(carga.datos);
  }

  const capa = useMemo(() => (ultima ? capaDeCalor(ultima, area) : CAPA_VACIA), [ultima, area]);

  return {
    ...capa,
    /** Lado de la celda en grados (0 hasta la primera respuesta). */
    celdaGrados: ultima?.celdaGrados ?? 0,
    /** `true` cuando ya llego una densidad para la capa encendida. */
    consultaHecha: ultima !== null,
    cargando: pedida !== null && carga.estado === 'cargando',
    error: activa && carga.estado === 'error' ? carga.error.mensaje : null,
    /** Hay respuesta y ninguna celda cae en la vista: «Sin reportes en esta zona con estos filtros». */
    sinReportesEnVista: ultima !== null && capa.celdas.length === 0,
  };
}

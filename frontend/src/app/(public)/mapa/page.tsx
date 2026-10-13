'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { listarDistritos } from '@/features/distritos/api';
import { buscarReportes, listarCategorias, type ReporteResumen } from '@/features/reportes/api';
import { PanelFiltrosMapa } from '@/features/reportes/components/PanelFiltrosMapa';
import {
  construirQuery,
  esBboxValido,
  requiereNuevaConsulta,
  FILTROS_VACIOS,
  type BoundingBox,
  type FiltrosMapa,
} from '@/features/reportes/model/bbox';
import type { CategoriaDano, Distrito } from '@/lib/types/domain';

const MapaReportes = dynamic(() => import('@/map/MapaReportes'), {
  ssr: false,
  loading: () => <div className="size-full animate-pulse bg-slate-200 dark:bg-slate-700" />,
});

/** Cuanta calma esperar tras el ultimo gesto antes de consultar. */
const ESPERA_MS = 400;

/**
 * Cuantos reportes pedir por area visible.
 *
 * El endpoint pagina con 20 por defecto, que en un mapa dejaria zonas
 * densas a medio dibujar. Se sube el tamano en vez de paginar porque un
 * mapa no tiene "siguiente pagina": o el marcador esta o no esta. El
 * `totalElements` de la respuesta permite avisar si el area supera el
 * limite.
 */
const MAXIMO_MARCADORES = 300;

/**
 * US-10: mapa publico de reportes con filtros.
 *
 * PUBLICA: no requiere sesion y no debe intentar adjuntar token — las
 * llamadas van con `conAuth: false` (ver los modulos `api.ts` de cada
 * feature). Un visitante anonimo la usa completa.
 */
export default function MapaPage() {
  const [reportes, setReportes] = useState<ReporteResumen[]>([]);
  const [total, setTotal] = useState(0);
  const [filtros, setFiltros] = useState<FiltrosMapa>(FILTROS_VACIOS);
  const [distritos, setDistritos] = useState<Distrito[]>([]);
  const [categorias, setCategorias] = useState<CategoriaDano[]>([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Area visible del mapa. Es estado, no ref: cambiarla es lo que dispara
  // la consulta.
  const [area, setArea] = useState<BoundingBox | null>(null);

  // Catalogos de los filtros: son estables, se piden una vez.
  useEffect(() => {
    let cancelado = false;
    const cargar = async () => {
      const [d, c] = await Promise.all([
        listarDistritos().catch(() => [] as Distrito[]),
        listarCategorias().catch(() => [] as CategoriaDano[]),
      ]);
      if (cancelado) return;
      setDistritos(d);
      setCategorias(c);
    };
    void cargar();
    return () => {
      cancelado = true;
    };
  }, []);

  /**
   * El mapa avisa su area cada vez que termina un gesto. Solo se adopta si
   * cambio lo suficiente: asi un ajuste minimo de encuadre no cuenta como
   * area nueva y no dispara el efecto de abajo.
   */
  const alCambiarArea = useCallback((bbox: BoundingBox) => {
    setArea((anterior) => (requiereNuevaConsulta(anterior, bbox) ? bbox : anterior));
  }, []);

  /**
   * Consulta los reportes del area visible con los filtros vigentes.
   *
   * El `setTimeout` con limpieza ES el debounce: cada cambio de area o de
   * filtros cancela el temporizador anterior, asi que arrastrar y hacer zoom
   * seguido produce una sola consulta al final. Se hace con el ciclo de
   * efectos en vez de una utilidad externa porque aqui la cancelacion ya
   * viene dada por React, y el flag `cancelado` descarta ademas las
   * respuestas que lleguen tarde (una consulta lenta de un area que el
   * usuario ya abandono no debe pisar a la actual).
   */
  useEffect(() => {
    if (!esBboxValido(area)) return;

    let cancelado = false;
    const temporizador = setTimeout(async () => {
      setCargando(true);
      setError(null);
      try {
        const pagina = await buscarReportes(construirQuery(area, filtros, MAXIMO_MARCADORES));
        if (cancelado) return;
        setReportes(pagina.contenido);
        setTotal(pagina.total);
      } catch {
        if (!cancelado) setError('No se pudieron cargar los reportes de esta zona.');
      } finally {
        if (!cancelado) setCargando(false);
      }
    }, ESPERA_MS);

    return () => {
      cancelado = true;
      clearTimeout(temporizador);
    };
  }, [area, filtros]);

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-800">
        <div>
          <h1 className="text-lg font-bold text-sky-700 dark:text-sky-400">
            <Link href="/">ViaSegura</Link> · Mapa de reportes
          </h1>
          <p className="text-xs text-slate-600 dark:text-slate-400">
            Daños viales reportados por vecinos de Lima Metropolitana
          </p>
        </div>
        <nav className="flex gap-2">
          <Link
            href="/desempeno"
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm dark:border-slate-600 dark:text-slate-200"
          >
            Desempeño por distrito
          </Link>
          <Link
            href="/reportar"
            className="rounded-md bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-700"
          >
            Reportar un daño
          </Link>
        </nav>
      </header>

      {error && (
        <p role="alert" className="bg-red-50 px-4 py-2 text-sm text-red-800 dark:bg-red-950 dark:text-red-200">
          {error}
        </p>
      )}

      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <PanelFiltrosMapa
          filtros={filtros}
          onCambiar={setFiltros}
          distritos={distritos}
          categorias={categorias}
          total={total}
          cargando={cargando}
        />
        <div className="min-h-96 flex-1">
          <MapaReportes reportes={reportes} onAreaCambiada={alCambiarArea} />
        </div>
      </div>

      {total > MAXIMO_MARCADORES && (
        <p className="bg-amber-50 px-4 py-2 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
          Se muestran {MAXIMO_MARCADORES} de {total} reportes. Acerca el mapa o aplica un filtro
          para verlos todos.
        </p>
      )}
    </div>
  );
}

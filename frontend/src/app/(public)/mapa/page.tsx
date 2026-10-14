'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { listarDistritos } from '@/features/distritos/api';
import { listarCategorias } from '@/features/reportes/api';
import { ListaReportes } from '@/features/reportes/components/ListaReportes';
import { PanelFiltrosMapa } from '@/features/reportes/components/PanelFiltrosMapa';
import {
  SelectorDeVista,
  type VistaResultados,
} from '@/features/reportes/components/SelectorDeVista';
import { useBusquedaMapa } from '@/features/reportes/hooks/useBusquedaMapa';
import { FILTROS_VACIOS, MAXIMO_MARCADORES, type FiltrosMapa } from '@/features/reportes/model/bbox';
import type { CategoriaDano, Distrito } from '@/lib/types/domain';

const MapaReportes = dynamic(() => import('@/map/MapaReportes'), {
  ssr: false,
  loading: () => <div className="size-full animate-pulse bg-slate-200 dark:bg-slate-700" />,
});

/**
 * US-10/US-12: mapa publico de reportes con filtros, y la misma busqueda
 * como lista paginada.
 *
 * PUBLICA: no requiere sesion y no debe intentar adjuntar token — las
 * llamadas van con `conAuth: false` (ver los modulos `api.ts` de cada
 * feature). Un visitante anonimo la usa completa.
 *
 * La consulta (area, debounce, validacion de fechas, cancelacion) vive en
 * `useBusquedaMapa`. La lista se dibuja ENCIMA del mapa en vez de
 * reemplazarlo: el mapa sigue montado, conserva su encuadre y su area sigue
 * definiendo los resultados de las dos vistas. `z-0` encierra los z-index
 * de Leaflet (hasta 1000) en el panel del mapa, para que la lista lo tape.
 */
export default function MapaPage() {
  const [filtros, setFiltros] = useState<FiltrosMapa>(FILTROS_VACIOS);
  const [vista, setVista] = useState<VistaResultados>('mapa');
  const [distritos, setDistritos] = useState<Distrito[]>([]);
  const [categorias, setCategorias] = useState<CategoriaDano[]>([]);
  const busqueda = useBusquedaMapa(filtros);

  // Catalogos de los filtros: son estables, se piden una vez. (Pendiente de
  // pasar a un hook en FE-05/FE-08, junto con los catalogos compartidos.)
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

      {busqueda.error && (
        <p role="alert" className="bg-red-50 px-4 py-2 text-sm text-red-800 dark:bg-red-950 dark:text-red-200">
          {busqueda.error}
        </p>
      )}

      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <PanelFiltrosMapa
          filtros={filtros}
          onCambiar={setFiltros}
          distritos={distritos}
          categorias={categorias}
          total={busqueda.total}
          cargando={busqueda.cargando}
          errorFiltros={busqueda.errorFiltros}
        />

        <div className="flex min-h-0 flex-1 flex-col">
          <SelectorDeVista vista={vista} onElegir={setVista} />

          <div className="relative min-h-96 flex-1">
            <div inert={vista !== 'mapa'} className="absolute inset-0 z-0">
              <MapaReportes reportes={busqueda.reportes} onAreaCambiada={busqueda.alCambiarArea} />
            </div>
            {vista === 'lista' && (
              <div className="absolute inset-0 z-10 overflow-y-auto bg-white dark:bg-slate-900">
                <ListaReportes
                  key={busqueda.claveConsulta}
                  reportes={busqueda.reportes}
                  consultaHecha={busqueda.consultaHecha}
                  cargando={busqueda.cargando}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {busqueda.total > MAXIMO_MARCADORES && (
        <p className="bg-amber-50 px-4 py-2 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
          Se muestran {MAXIMO_MARCADORES} de {busqueda.total} reportes. Acerca el mapa o aplica un
          filtro para verlos todos.
        </p>
      )}
    </div>
  );
}

'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { Suspense, useState } from 'react';
import { CapasDelMapa } from '@/features/reportes/components/CapasDelMapa';
import { ListaReportes } from '@/features/reportes/components/ListaReportes';
import { PanelFiltrosMapa } from '@/features/reportes/components/PanelFiltrosMapa';
import { SelectorDeVista } from '@/features/reportes/components/SelectorDeVista';
import { useBusquedaMapa } from '@/features/reportes/hooks/useBusquedaMapa';
import { useCatalogosMapa } from '@/features/reportes/hooks/useCatalogosMapa';
import { useDensidadMapa } from '@/features/reportes/hooks/useDensidadMapa';
import { useEstadoDelMapaEnUrl } from '@/features/reportes/hooks/useEstadoDelMapaEnUrl';
import { MAXIMO_MARCADORES } from '@/features/reportes/model/bbox';
import { rutaDelDetalle } from '@/features/reportes/model/estadoDelMapa';

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
 *
 * US-11: la capa de calor usa los mismos filtros y el area de la busqueda
 * (solo para la escala de la vista; la densidad no se vuelve a pedir al
 * mover el mapa). Marcadores y calor se encienden y apagan por separado,
 * cada uno con su casilla en «Capas del mapa»; ocultar los marcadores no
 * detiene la busqueda, que sigue alimentando la lista.
 *
 * QA-1 M-9: filtros y vista viven en la URL (`useEstadoDelMapaEnUrl`), no en
 * estado local: al volver del detalle la pantalla reaparece igual y la
 * direccion se puede compartir. Las capas (marcadores y calor) siguen siendo
 * locales: son de quien mira, no un filtro de los resultados.
 */
export default function MapaPage() {
  return (
    // `useSearchParams` (dentro de `useEstadoDelMapaEnUrl`) exige un limite de Suspense.
    <Suspense fallback={<p className="p-8 text-slate-600 dark:text-slate-400">Cargando el mapa…</p>}>
      <MapaConFiltros />
    </Suspense>
  );
}

function MapaConFiltros() {
  const [marcadores, setMarcadores] = useState(true);
  const [calor, setCalor] = useState(false);
  // Catalogos de los filtros: son estables, se piden una vez.
  const { distritos, categorias } = useCatalogosMapa();
  const { filtros, vista, ruta, cambiarFiltros, cambiarVista } = useEstadoDelMapaEnUrl(
    distritos,
    categorias,
  );
  const hrefDelDetalle = (reporteId: number) => rutaDelDetalle(reporteId, ruta);
  const busqueda = useBusquedaMapa(filtros);
  const densidad = useDensidadMapa(filtros, calor, busqueda.area);

  return (
    <div className="flex h-dvh flex-col">
      {/* QA-1 I-4: en el movil la cabecera se compacta (sin subtitulo, los
          enlaces pasan abajo si no caben) para dejarle la pantalla al mapa. */}
      <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 border-b border-slate-200 bg-white px-4 py-2 md:py-3 dark:border-slate-700 dark:bg-slate-800">
        <div>
          <h1 className="text-base font-bold text-sky-700 md:text-lg dark:text-sky-400">
            <Link href="/">Ciudad Viva</Link> · Mapa de reportes
          </h1>
          <p className="hidden text-xs text-slate-600 sm:block dark:text-slate-400">
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
          onCambiar={cambiarFiltros}
          distritos={distritos}
          categorias={categorias}
          total={busqueda.total}
          cargando={busqueda.cargando}
          errorFiltros={busqueda.errorFiltros}
        >
          <CapasDelMapa
            marcadores={marcadores}
            onCambiarMarcadores={setMarcadores}
            calor={calor}
            onCambiarCalor={setCalor}
            capaCalor={densidad}
          />
        </PanelFiltrosMapa>

        <div className="flex min-h-0 flex-1 flex-col">
          <SelectorDeVista vista={vista} onElegir={cambiarVista} />

          {/* En el movil el mapa toma lo que deja la cabecera (QA-1 I-4): el
              alto minimo es menor para que, con el panel desplegado, el mapa
              siga a la vista debajo de el. */}
          <div className="relative min-h-48 flex-1 md:min-h-96">
            <div inert={vista !== 'mapa'} className="absolute inset-0 z-0">
              <MapaReportes
                reportes={busqueda.reportes}
                onAreaCambiada={busqueda.alCambiarArea}
                mostrarMarcadores={marcadores}
                celdasCalor={densidad.celdas}
                hrefDelDetalle={hrefDelDetalle}
              />
            </div>
            {vista === 'lista' && (
              <div className="absolute inset-0 z-10 overflow-y-auto bg-white dark:bg-slate-900">
                <ListaReportes
                  key={busqueda.claveConsulta}
                  reportes={busqueda.reportes}
                  consultaHecha={busqueda.consultaHecha}
                  cargando={busqueda.cargando}
                  hrefDelDetalle={hrefDelDetalle}
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

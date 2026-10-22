'use client';

import { useState, type ReactNode } from 'react';
import { ESTADOS_EN_MAPA, estiloDeEstado } from '@/lib/types/estados';
import {
  cantidadDeFiltrosActivos,
  FILTROS_VACIOS,
  hayFiltrosActivos,
  type FiltrosMapa,
} from '../model/bbox';
import type { CategoriaDano, Distrito } from '@/lib/types/domain';

/**
 * Filtros y leyenda del mapa publico (US-10, escenario 2; fechas de US-12).
 *
 * La leyenda nombra cada estado ademas de colorearlo: la informacion no
 * puede depender solo del color (accesibilidad, US-23).
 */
interface Props {
  filtros: FiltrosMapa;
  onCambiar: (filtros: FiltrosMapa) => void;
  distritos: Distrito[];
  categorias: CategoriaDano[];
  /** Reportes que cumplen los filtros en el área visible. */
  total: number;
  cargando: boolean;
  /** Filtros que no se pueden consultar (p. ej. rango de fechas invertido). */
  errorFiltros?: string | null;
  /** Controles extra entre los filtros y la leyenda de estados (las capas del mapa, US-11). */
  children?: ReactNode;
}

/** Id del contenido plegable del panel (lo controla el boton del movil). */
const ID_CONTENIDO = 'panel-filtros-mapa';

/**
 * QA-1 I-4: en pantallas angostas el panel se PLIEGA. Antes, en el movil,
 * filtros, capas y leyenda iban encima del mapa y lo empujaban debajo del
 * pliegue (el mapa empezaba en y = 922 px con un viewport de 844). Ahora el
 * mapa ocupa la primera pantalla y el panel queda en una franja con el
 * conteo y un boton «Filtros, capas y leyenda» (`aria-expanded`) que lo
 * despliega encima del mapa, con su propio desplazamiento. En escritorio
 * (`md`) no cambia: barra lateral siempre abierta y el boton no se muestra.
 *
 * Es provisional y compatible con el rediseño en curso, que lo convertira en
 * una hoja inferior: el contenido del panel no cambia, solo su contenedor.
 */
export function PanelFiltrosMapa({
  filtros,
  onCambiar,
  distritos,
  categorias,
  total,
  cargando,
  errorFiltros = null,
  children,
}: Props) {
  const hayFiltros = hayFiltrosActivos(filtros);
  const activos = cantidadDeFiltrosActivos(filtros);
  const [abierto, setAbierto] = useState(false);

  return (
    <aside className="flex w-full shrink-0 flex-col border-b border-slate-200 bg-white md:w-72 md:overflow-y-auto md:border-r md:border-b-0 dark:border-slate-700 dark:bg-slate-800">
      <div className="flex items-center justify-between gap-3 px-4 py-2 md:block md:px-4 md:pt-4 md:pb-0">
        <div>
          <h2 className="hidden text-sm font-semibold text-slate-900 md:block dark:text-slate-100">
            Filtros
          </h2>
          <p aria-live="polite" className="text-sm text-slate-600 md:mt-0.5 dark:text-slate-400">
            {/* Con filtros invalidos no se consulta: el mapa y la lista siguen
                mostrando la busqueda anterior, y un conteo aqui pareceria vigente. */}
            {errorFiltros
              ? 'Resultados sin actualizar: corrige las fechas.'
              : cargando
                ? 'Buscando…'
                : `${total} ${total === 1 ? 'reporte' : 'reportes'} en esta zona`}
          </p>
        </div>
        <button
          type="button"
          aria-expanded={abierto}
          aria-controls={ID_CONTENIDO}
          onClick={() => setAbierto((a) => !a)}
          className="flex shrink-0 items-center gap-1.5 rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium
                     text-slate-700 md:hidden dark:border-slate-600 dark:text-slate-200"
        >
          <span>Filtros, capas y leyenda</span>
          {activos > 0 && (
            <>
              {' '}
              <span className="rounded-full bg-sky-600 px-1.5 text-xs text-white">
                {activos}
                <span className="sr-only">{` ${activos === 1 ? 'filtro aplicado' : 'filtros aplicados'}`}</span>
              </span>
            </>
          )}
          <span aria-hidden="true" className="text-xs">
            {abierto ? '▲' : '▼'}
          </span>
        </button>
      </div>

      {/* Plegado (`hidden`) solo por debajo de `md`; en escritorio siempre
          visible. Desplegado en el movil se limita a ~la mitad de la pantalla
          y se desplaza solo, para que el mapa siga a la vista debajo. */}
      <div
        id={ID_CONTENIDO}
        className={`${abierto ? 'flex' : 'hidden'} max-h-[55dvh] flex-col gap-4 overflow-y-auto px-4 pt-2 pb-4
                    md:flex md:max-h-none md:overflow-visible md:pt-4`}
      >
        <Selector
          id="filtro-distrito"
          etiqueta="Distrito"
          valor={filtros.distritoId}
          onCambiar={(v) => onCambiar({ ...filtros, distritoId: v })}
          opciones={distritos.map((d) => ({ valor: d.id, texto: d.nombre }))}
        />

        <Selector
          id="filtro-categoria"
          etiqueta="Tipo de daño"
          valor={filtros.categoriaId}
          onCambiar={(v) => onCambiar({ ...filtros, categoriaId: v })}
          opciones={categorias.map((c) => ({ valor: c.id, texto: c.nombre }))}
        />

        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="filtro-estado"
            className="text-sm font-medium text-slate-700 dark:text-slate-200"
          >
            Estado
          </label>
          <select
            id="filtro-estado"
            value={filtros.estado ?? ''}
            onChange={(e) => onCambiar({ ...filtros, estado: e.target.value || null })}
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm
                       dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
          >
            <option value="">Todos</option>
            {ESTADOS_EN_MAPA.map((estado) => (
              <option key={estado} value={estado}>
                {estiloDeEstado(estado).etiqueta}
              </option>
            ))}
          </select>
        </div>

        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-medium text-slate-700 dark:text-slate-200">
            Fecha del reporte
          </legend>
          <div className="grid grid-cols-2 gap-2">
            <CampoFecha
              id="filtro-fecha-desde"
              etiqueta="Desde"
              valor={filtros.fechaDesde}
              onCambiar={(v) => onCambiar({ ...filtros, fechaDesde: v })}
              invalido={errorFiltros != null}
            />
            <CampoFecha
              id="filtro-fecha-hasta"
              etiqueta="Hasta"
              valor={filtros.fechaHasta}
              onCambiar={(v) => onCambiar({ ...filtros, fechaHasta: v })}
              invalido={errorFiltros != null}
            />
          </div>
          {errorFiltros && (
            <p id="filtro-fecha-error" role="alert" className="text-sm text-red-700 dark:text-red-300">
              {errorFiltros}
            </p>
          )}
        </fieldset>

        {hayFiltros && (
          <button
            type="button"
            onClick={() => onCambiar(FILTROS_VACIOS)}
            className="self-start text-sm font-medium text-sky-700 hover:underline dark:text-sky-400"
          >
            Limpiar filtros
          </button>
        )}

        {children}

        <div className="mt-2 border-t border-slate-200 pt-4 dark:border-slate-700">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Leyenda</h2>
          <ul aria-label="Leyenda de estados" className="mt-2 flex flex-col gap-1.5">
            {ESTADOS_EN_MAPA.map((estado) => {
              const estilo = estiloDeEstado(estado);
              return (
                <li key={estado} className="flex items-start gap-2 text-sm">
                  <span
                    aria-hidden="true"
                    className="mt-1 inline-block size-3 shrink-0 rounded-full border-2 border-white shadow"
                    style={{ background: estilo.color }}
                  />
                  <span>
                    <span className="text-slate-900 dark:text-slate-100">{estilo.etiqueta}</span>
                    <span className="block text-xs text-slate-500 dark:text-slate-400">
                      {estilo.descripcion}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </aside>
  );
}

/**
 * Dia local `AAAA-MM-DD`. El rango invertido no se impide con `min`/`max`
 * (se puede escribir igual): se valida antes de consultar y se avisa.
 */
function CampoFecha({
  id,
  etiqueta,
  valor,
  onCambiar,
  invalido,
}: {
  id: string;
  etiqueta: string;
  valor: string | null;
  onCambiar: (valor: string | null) => void;
  invalido: boolean;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <label htmlFor={id} className="text-xs text-slate-600 dark:text-slate-400">
        {etiqueta}
      </label>
      <input
        id={id}
        type="date"
        value={valor ?? ''}
        onChange={(e) => onCambiar(e.target.value || null)}
        aria-invalid={invalido || undefined}
        aria-describedby={invalido ? 'filtro-fecha-error' : undefined}
        className="min-w-0 rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm
                   aria-invalid:border-red-500 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
      />
    </div>
  );
}

function Selector({
  id,
  etiqueta,
  valor,
  onCambiar,
  opciones,
}: {
  id: string;
  etiqueta: string;
  valor: number | null;
  onCambiar: (valor: number | null) => void;
  opciones: { valor: number; texto: string }[];
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-slate-700 dark:text-slate-200">
        {etiqueta}
      </label>
      <select
        id={id}
        value={valor ?? ''}
        onChange={(e) => onCambiar(e.target.value ? Number(e.target.value) : null)}
        className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm
                   dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
      >
        <option value="">Todos</option>
        {opciones.map((o) => (
          <option key={o.valor} value={o.valor}>
            {o.texto}
          </option>
        ))}
      </select>
    </div>
  );
}

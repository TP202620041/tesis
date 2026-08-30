'use client';

import { ESTADOS_EN_MAPA, estiloDeEstado } from '@/features/reportes/mapa/estados';
import type { FiltrosMapa } from '@/features/reportes/mapa/bbox';
import type { CategoriaDano, Distrito } from '@/lib/types/domain';

/**
 * Filtros y leyenda del mapa publico (US-10, escenario 2).
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
}

export function PanelFiltrosMapa({
  filtros,
  onCambiar,
  distritos,
  categorias,
  total,
  cargando,
}: Props) {
  const hayFiltros =
    filtros.distritoId != null || filtros.categoriaId != null || filtros.estado != null;

  return (
    <aside className="flex w-full shrink-0 flex-col gap-4 border-slate-200 bg-white p-4 md:w-72 md:border-r dark:border-slate-700 dark:bg-slate-800">
      <div>
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Filtros</h2>
        <p aria-live="polite" className="mt-0.5 text-sm text-slate-600 dark:text-slate-400">
          {cargando
            ? 'Buscando…'
            : `${total} ${total === 1 ? 'reporte' : 'reportes'} en esta zona`}
        </p>
      </div>

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

      {hayFiltros && (
        <button
          type="button"
          onClick={() => onCambiar({ distritoId: null, categoriaId: null, estado: null })}
          className="self-start text-sm font-medium text-sky-700 hover:underline dark:text-sky-400"
        >
          Limpiar filtros
        </button>
      )}

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
    </aside>
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

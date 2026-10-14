'use client';

import Link from 'next/link';
import { useState } from 'react';
import { estiloDeEstado } from '@/lib/types/estados';
import { paginar, TAMANO_PAGINA_LISTA } from '../model/paginacion';
import type { ReporteResumen } from '../model/tipos';

interface Props {
  /** Los mismos reportes que muestra el mapa (última consulta del área visible). */
  reportes: ReporteResumen[];
  tamanoPagina?: number;
}

/**
 * US-12: vista de lista de la búsqueda pública, paginada en el cliente sobre
 * los mismos resultados del mapa. Cada fila enlaza al detalle público del
 * reporte. Usa solo campos públicos del resumen (nunca `posibleReincidencia`,
 * que es una señal interna).
 *
 * La página vuelve a la primera cuando cambia la consulta: quien la usa le
 * pasa como `key` la clave de la consulta.
 */
export function ListaReportes({ reportes, tamanoPagina = TAMANO_PAGINA_LISTA }: Props) {
  const [paginaPedida, setPaginaPedida] = useState(0);
  const pagina = paginar(reportes, paginaPedida, tamanoPagina);

  if (pagina.total === 0) {
    return (
      <p className="p-4 text-sm text-slate-600 dark:text-slate-400">
        No hay reportes en esta zona con los filtros elegidos. Mueve el mapa o cambia los filtros.
      </p>
    );
  }

  return (
    <section aria-label="Reportes en esta zona" className="flex flex-col">
      <ul className="divide-y divide-slate-200 dark:divide-slate-700">
        {pagina.elementos.map((reporte) => (
          <li key={reporte.id}>
            <FilaReporte reporte={reporte} />
          </li>
        ))}
      </ul>

      <nav
        aria-label="Paginación de la lista"
        className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 px-4 py-3 text-sm dark:border-slate-700"
      >
        <p aria-live="polite" className="text-slate-600 dark:text-slate-400">
          {pagina.desde}–{pagina.hasta} de {pagina.total}
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPaginaPedida(pagina.pagina - 1)}
            disabled={pagina.pagina === 0}
            className="rounded-md border border-slate-300 px-3 py-1.5 disabled:opacity-50 dark:border-slate-600 dark:text-slate-200"
          >
            Anterior
          </button>
          <span className="text-slate-700 dark:text-slate-300">
            Página {pagina.pagina + 1} de {pagina.totalPaginas}
          </span>
          <button
            type="button"
            onClick={() => setPaginaPedida(pagina.pagina + 1)}
            disabled={pagina.pagina >= pagina.totalPaginas - 1}
            className="rounded-md border border-slate-300 px-3 py-1.5 disabled:opacity-50 dark:border-slate-600 dark:text-slate-200"
          >
            Siguiente
          </button>
        </div>
      </nav>
    </section>
  );
}

function FilaReporte({ reporte }: { reporte: ReporteResumen }) {
  const estilo = estiloDeEstado(reporte.estado ?? '');
  const adhesiones = reporte.totalAdhesiones ?? 1;
  const fecha = reporte.createdAt
    ? new Date(reporte.createdAt).toLocaleDateString('es-PE', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : null;

  return (
    <Link
      href={`/reportes/${reporte.id}`}
      className="flex flex-col gap-1 px-4 py-3 hover:bg-slate-50 focus-visible:bg-slate-50 dark:hover:bg-slate-800 dark:focus-visible:bg-slate-800"
    >
      <span className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium text-slate-900 dark:text-slate-100">
          {reporte.categoriaNombre ?? 'Sin categoría'}
        </span>
        {/* Estado con nombre además del color (US-23). */}
        <span className="inline-flex items-center gap-1.5 text-sm text-slate-700 dark:text-slate-300">
          <span
            aria-hidden="true"
            className="inline-block size-2.5 rounded-full"
            style={{ background: estilo.color }}
          />
          {estilo.etiqueta}
        </span>
      </span>
      <span className="text-sm text-slate-600 dark:text-slate-400">
        {reporte.distritoNombre ?? 'Distrito desconocido'}
        {fecha ? ` · ${fecha}` : ''}
        {` · ${adhesiones} ${adhesiones === 1 ? 'vecino lo reportó' : 'vecinos lo reportaron'}`}
      </span>
    </Link>
  );
}

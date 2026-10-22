'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ChipEstado } from '@/components/ui/ChipEstado';
import { textoDeSeveridad, tituloVisible } from '@/lib/types/tituloYSeveridad';
import { paginar, TAMANO_PAGINA_LISTA } from '../model/paginacion';
import type { ReporteResumen } from '../model/tipos';
import { clasesDeBoton } from '@/components/ui/Boton';

interface Props {
  /** Los mismos reportes que muestra el mapa (última consulta del área visible). */
  reportes: ReporteResumen[];
  /** `false` hasta la primera respuesta: «sin datos aún» no es «cero resultados». */
  consultaHecha: boolean;
  /** Hay una consulta en vuelo (los reportes mostrados son los anteriores). */
  cargando: boolean;
  tamanoPagina?: number;
  /**
   * Enlace al detalle de cada reporte. QA-1 M-9: `/mapa` lo arma con `?volver=`
   * para que «← Volver al mapa» regrese a la misma vista filtrada.
   */
  hrefDelDetalle?: (reporteId: number) => string;
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
export function ListaReportes({
  reportes,
  consultaHecha,
  cargando,
  tamanoPagina = TAMANO_PAGINA_LISTA,
  hrefDelDetalle = hrefPorDefecto,
}: Props) {
  const [paginaPedida, setPaginaPedida] = useState(0);
  const pagina = paginar(reportes, paginaPedida, tamanoPagina);

  // Solo se afirma «no hay reportes» con una respuesta confirmada y nada en vuelo.
  if (pagina.total === 0 && (!consultaHecha || cargando)) {
    return (
      <p role="status" className="p-4 text-sm text-texto-2">
        Buscando reportes…
      </p>
    );
  }

  if (pagina.total === 0) {
    return (
      <p className="p-4 text-sm text-texto-2">
        No hay reportes en esta zona con los filtros elegidos. Mueve el mapa o cambia los filtros.
      </p>
    );
  }

  return (
    <section aria-label="Reportes en esta zona" aria-busy={cargando} className="flex flex-col">
      {cargando && (
        <p role="status" className="px-4 pt-3 text-xs text-texto-2">
          Actualizando…
        </p>
      )}
      <ul className="divide-y divide-linea">
        {pagina.elementos.map((reporte) => (
          <li key={reporte.id}>
            <FilaReporte reporte={reporte} href={hrefDelDetalle(reporte.id ?? 0)} />
          </li>
        ))}
      </ul>

      <nav
        aria-label="Paginación de la lista"
        className="flex flex-wrap items-center justify-between gap-2 border-t border-linea px-4 py-3 text-sm"
      >
        <p aria-live="polite" className="text-texto-2">
          {pagina.desde}–{pagina.hasta} de {pagina.total}
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPaginaPedida(pagina.pagina - 1)}
            disabled={pagina.pagina === 0}
            className={clasesDeBoton('secundario', 'compacto')}
          >
            Anterior
          </button>
          <span className="text-texto">
            Página {pagina.pagina + 1} de {pagina.totalPaginas}
          </span>
          <button
            type="button"
            onClick={() => setPaginaPedida(pagina.pagina + 1)}
            disabled={pagina.pagina >= pagina.totalPaginas - 1}
            className={clasesDeBoton('secundario', 'compacto')}
          >
            Siguiente
          </button>
        </div>
      </nav>
    </section>
  );
}

function hrefPorDefecto(reporteId: number): string {
  return `/reportes/${reporteId}`;
}

function FilaReporte({ reporte, href }: { reporte: ReporteResumen; href: string }) {
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
      href={href}
      className="flex flex-col gap-1 px-4 py-3 hover:bg-superficie-2 focus-visible:bg-superficie-2"
    >
      <span className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium text-texto">
          {tituloVisible(reporte.titulo)}
        </span>
        {/* Estado con nombre e icono además del color (US-23, DIS-1). */}
        <ChipEstado estado={reporte.estado ?? ''} />
      </span>
      <span className="text-sm text-texto">
        {[reporte.categoriaNombre ?? 'Sin categoría', textoDeSeveridad(reporte.severidad)]
          .filter(Boolean)
          .join(' · ')}
      </span>
      <span className="text-sm text-texto-2">
        {reporte.distritoNombre ?? 'Distrito desconocido'}
        {fecha ? ` · ${fecha}` : ''}
        {` · ${adhesiones} ${adhesiones === 1 ? 'vecino lo reportó' : 'vecinos lo reportaron'}`}
      </span>
    </Link>
  );
}

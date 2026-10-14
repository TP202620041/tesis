'use client';

import Link from 'next/link';
import { estiloDeEstado } from '@/lib/types/estados';
import type { ReporteResumen } from '@/features/reportes/model/tipos';

/** Criterios de orden de la bandeja. */
export type OrdenBandeja = 'apoyos' | 'recientes';

/**
 * Ordena una copia de la lista, sin mutar la recibida.
 *
 * El backend devuelve la bandeja por fecha descendente. El orden por apoyos
 * se hace aqui, y es correcto y no parcial porque el endpoint entrega la
 * LISTA COMPLETA del distrito, no una pagina — ordenar una pagina en el
 * cliente si habria sido enganoso.
 */
export function ordenar(reportes: ReporteResumen[], orden: OrdenBandeja): ReporteResumen[] {
  const copia = [...reportes];
  if (orden === 'recientes') {
    return copia.sort((a, b) => fecha(b) - fecha(a));
  }
  // Desempate por fecha: entre dos reportes con los mismos apoyos, primero
  // el mas antiguo — lleva mas tiempo esperando atencion.
  return copia.sort(
    (a, b) => (b.totalAdhesiones ?? 0) - (a.totalAdhesiones ?? 0) || fecha(a) - fecha(b),
  );
}

function fecha(r: ReporteResumen): number {
  return r.createdAt ? new Date(r.createdAt).getTime() : 0;
}

interface Props {
  reportes: ReporteResumen[];
  orden: OrdenBandeja;
  onOrdenar: (orden: OrdenBandeja) => void;
}

export function TablaBandeja({ reportes, orden, onOrdenar }: Props) {
  if (reportes.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-slate-300 p-8 text-center text-slate-500 dark:border-slate-600 dark:text-slate-400">
        No hay reportes que coincidan con los filtros.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 text-sm">
        <span className="text-slate-600 dark:text-slate-400">Ordenar por:</span>
        <BotonOrden actual={orden} valor="apoyos" onOrdenar={onOrdenar}>
          Más apoyados
        </BotonOrden>
        <BotonOrden actual={orden} valor="recientes" onOrdenar={onOrdenar}>
          Más recientes
        </BotonOrden>
      </div>

      <ul className="flex flex-col gap-2">
        {reportes.map((reporte) => {
          const estilo = estiloDeEstado(reporte.estado ?? '');
          return (
            <li key={reporte.id}>
              <Link
                href={`/bandeja/${reporte.id}`}
                className="flex items-start gap-3 rounded-md border border-slate-200 bg-white p-3
                           transition hover:border-sky-400 dark:border-slate-700 dark:bg-slate-800"
              >
                <span
                  aria-hidden="true"
                  className="mt-1 size-3 shrink-0 rounded-full"
                  style={{ background: estilo.color }}
                />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <strong className="text-slate-900 dark:text-slate-100">
                      {reporte.categoriaNombre}
                    </strong>
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      {estilo.etiqueta}
                    </span>
                    {reporte.posibleReincidencia && (
                      // Marcado por US-27: un vecino comentó que el daño
                      // reaparecio o quedo mal reparado.
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-900 dark:bg-amber-900 dark:text-amber-100">
                        Posible reincidencia
                      </span>
                    )}
                  </span>
                  {reporte.descripcion && (
                    <span className="mt-0.5 block truncate text-sm text-slate-600 dark:text-slate-400">
                      {reporte.descripcion}
                    </span>
                  )}
                  <span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-400">
                    {reporte.createdAt
                      ? new Date(reporte.createdAt).toLocaleDateString('es-PE')
                      : '—'}
                    {' · '}
                    {reporte.totalAdhesiones ?? 1}{' '}
                    {(reporte.totalAdhesiones ?? 1) === 1 ? 'vecino' : 'vecinos'}
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function BotonOrden({
  actual,
  valor,
  onOrdenar,
  children,
}: {
  actual: OrdenBandeja;
  valor: OrdenBandeja;
  onOrdenar: (o: OrdenBandeja) => void;
  children: React.ReactNode;
}) {
  const activo = actual === valor;
  return (
    <button
      type="button"
      aria-pressed={activo}
      onClick={() => onOrdenar(valor)}
      className={`rounded-md px-2 py-1 ${
        activo
          ? 'bg-sky-600 text-white'
          : 'border border-slate-300 text-slate-700 dark:border-slate-600 dark:text-slate-200'
      }`}
    >
      {children}
    </button>
  );
}

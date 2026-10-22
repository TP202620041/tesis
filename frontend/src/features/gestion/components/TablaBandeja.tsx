'use client';

import Link from 'next/link';
import { ChipEstado } from '@/components/ui/ChipEstado';
import { textoDeSeveridad, tituloVisible } from '@/lib/types/tituloYSeveridad';
import type { ReporteGestion } from '../model/tipos';

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
export function ordenar(reportes: ReporteGestion[], orden: OrdenBandeja): ReporteGestion[] {
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

function fecha(r: ReporteGestion): number {
  return r.createdAt ? new Date(r.createdAt).getTime() : 0;
}

interface Props {
  reportes: ReporteGestion[];
  orden: OrdenBandeja;
  onOrdenar: (orden: OrdenBandeja) => void;
}

export function TablaBandeja({ reportes, orden, onOrdenar }: Props) {
  if (reportes.length === 0) {
    return (
      <p className="rounded-control border border-dashed border-linea-campo p-8 text-center text-texto-2">
        No hay reportes que coincidan con los filtros.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 text-sm">
        <span className="text-texto-2">Ordenar por:</span>
        <BotonOrden actual={orden} valor="apoyos" onOrdenar={onOrdenar}>
          Más apoyados
        </BotonOrden>
        <BotonOrden actual={orden} valor="recientes" onOrdenar={onOrdenar}>
          Más recientes
        </BotonOrden>
      </div>

      <ul className="flex flex-col gap-2">
        {reportes.map((reporte) => {
          return (
            <li key={reporte.id}>
              <Link
                href={`/bandeja/${reporte.id}`}
                className="flex items-start gap-3 rounded-control border border-linea bg-superficie p-3
                           transition hover:border-primario"
              >
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    {/* NC-02: el titulo y la severidad los declara el ciudadano;
                        el funcionario los ve pero no los cambia. */}
                    <strong className="text-texto">
                      {tituloVisible(reporte.titulo)}
                    </strong>
                    <ChipEstado estado={reporte.estado ?? ''} />
                    {reporte.posibleReincidencia && (
                      // Marcado por US-27: un vecino comentó que el daño
                      // reaparecio o quedo mal reparado.
                      <span className="rounded-full bg-aviso-fondo px-2 py-0.5 text-xs text-aviso-texto">
                        Posible reincidencia
                      </span>
                    )}
                  </span>
                  <span className="mt-0.5 block text-sm text-texto">
                    {[reporte.categoriaNombre, textoDeSeveridad(reporte.severidad)]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                  {reporte.descripcion && (
                    <span className="mt-0.5 block truncate text-sm text-texto-2">
                      {reporte.descripcion}
                    </span>
                  )}
                  <span className="mt-0.5 block text-xs text-texto-2">
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
      className={`min-h-9 rounded-control border px-3 py-1 pointer-coarse:min-h-objetivo ${
        activo
          ? 'border-primario bg-primario font-semibold text-sobre-primario'
          : 'border-linea-campo bg-superficie text-texto hover:bg-superficie-2'
      }`}
    >
      {children}
    </button>
  );
}

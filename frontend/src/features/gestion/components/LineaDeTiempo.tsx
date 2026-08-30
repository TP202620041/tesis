'use client';

import { estiloDeEstado } from '@/features/reportes/mapa/estados';
import type { HistorialEntrada } from '@/features/gestion/api';

/**
 * US-22: linea de tiempo unificada de la gestion del reporte.
 *
 * Mezcla cambios de estado y asignaciones de responsable en un solo hilo
 * cronologico — asi lo modela el backend desde la migracion V4, con
 * `tipo_evento` como discriminador.
 *
 * Al funcionario del distrito el backend le entrega el detalle SIN redactar:
 * ve el nombre del responsable asignado y el autor de cada cambio. Al
 * ciudadano le muestra esas mismas filas como un hito generico ("Se asignó un
 * responsable"). Este componente es la vista municipal.
 */
export function LineaDeTiempo({ entradas }: { entradas: HistorialEntrada[] }) {
  if (entradas.length === 0) {
    return (
      <p className="text-sm text-slate-500 dark:text-slate-400">
        Todavía no hay movimientos registrados.
      </p>
    );
  }

  return (
    <ol className="flex flex-col gap-3">
      {entradas.map((entrada) => (
        <li key={entrada.id} className="flex gap-3">
          <span
            aria-hidden="true"
            className="mt-1.5 size-2 shrink-0 rounded-full bg-slate-400 dark:bg-slate-500"
          />
          <div className="min-w-0 flex-1 text-sm">
            <p className="text-slate-900 dark:text-slate-100">{describir(entrada)}</p>
            {entrada.comentario && (
              <p className="text-slate-600 dark:text-slate-400">{entrada.comentario}</p>
            )}
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {entrada.fecha ? new Date(entrada.fecha).toLocaleString('es-PE') : '—'}
              {entrada.autor ? ` · ${entrada.autor}` : ''}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}

/**
 * Una fila ASIGNACION no lleva estados (son null a proposito: asignar no es
 * una transicion), asi que se describe por su tipo de evento y no por el
 * cambio de estado.
 */
function describir(entrada: HistorialEntrada): string {
  if (entrada.tipoEvento === 'ASIGNACION') {
    return 'Asignación de responsable';
  }
  const nuevo = entrada.estadoNuevo ? estiloDeEstado(entrada.estadoNuevo).etiqueta : '—';
  if (!entrada.estadoAnterior) {
    return `Estado: ${nuevo}`;
  }
  return `${estiloDeEstado(entrada.estadoAnterior).etiqueta} → ${nuevo}`;
}

'use client';

import { estiloDeEstado } from '@/lib/types/estados';
import type { components } from '@/lib/api/generated/schema';

type HistorialEntrada = components['schemas']['HistorialEntradaResponse'];

/**
 * US-22: linea de tiempo unificada de la gestion de un reporte.
 *
 * Mezcla cambios de estado y asignaciones de responsable en un solo hilo
 * cronologico — asi lo modela el backend desde la migracion V4, con
 * `tipo_evento` como discriminador.
 *
 * <b>Sirve a los dos publicos sin ramificar aqui.</b> El backend entrega al
 * funcionario del distrito el detalle sin redactar (nombre del responsable,
 * autor de cada cambio) y al ciudadano las mismas filas como un hito
 * generico ("Se asigno un responsable"). La redaccion es una decision de
 * autorizacion y vive donde corresponde: en el servidor. Este componente
 * solo pinta lo que recibe, por eso esta en `components/` compartidos y no
 * dentro de la feature de gestion.
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

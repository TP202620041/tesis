import type { ReactNode } from 'react';
import { FotoDeReporte } from '@/components/FotoDeReporte';
import { ChipEstado } from '@/components/ui/ChipEstado';
import { textoDeSeveridad, tituloVisible } from '@/lib/types/tituloYSeveridad';
import type { ReporteResumen } from '../model/tipos';

/** Caja de una fila de las listas del ciudadano (la que no es enlace). */
export const CLASES_FILA_DE_REPORTE =
  'flex items-start gap-3 rounded-control border border-linea bg-superficie p-3';

/** La misma caja cuando la fila entera es un enlace. */
export const CLASES_FILA_DE_REPORTE_ENLACE = `${CLASES_FILA_DE_REPORTE} transition hover:border-primario`;

/**
 * Contenido de una fila de reporte en «Mis reportes» (los que envió y, QA-1
 * M-6, los que apoya): foto, título, estado, tipo, severidad, distrito,
 * fecha y vecinos. Solo el contenido: la caja (enlace o no) la pone la lista.
 * `children` va debajo de los datos (p. ej. por qué una fila no enlaza).
 */
export function ResumenDeReporteEnFila({
  reporte,
  children,
}: {
  reporte: ReporteResumen;
  children?: ReactNode;
}) {
  const severidad = textoDeSeveridad(reporte.severidad);
  // `api.ts` ya devuelve la URL absoluta de la foto.
  const foto = reporte.fotoUrl;
  return (
    <>
      {foto ? (
        // Foto de reporte: pública, sirve directo en <img src>.
        // Decorativa: el título de la fila ya nombra el reporte.
        <FotoDeReporte src={foto} alt="" className="size-14 shrink-0 rounded object-cover" />
      ) : (
        <span aria-hidden="true" className="size-14 shrink-0 rounded bg-superficie-2" />
      )}
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <strong className="text-texto">{tituloVisible(reporte.titulo)}</strong>
          <ChipEstado estado={reporte.estado ?? ''} />
        </span>
        <span className="mt-0.5 block text-sm text-texto-2">
          {reporte.categoriaNombre}
          {severidad ? ` · ${severidad}` : ''}
        </span>
        <span className="mt-0.5 block text-sm text-texto-2">
          {reporte.distritoNombre}
          {reporte.createdAt ? ` · ${new Date(reporte.createdAt).toLocaleDateString('es-PE')}` : ''}
          {(reporte.totalAdhesiones ?? 1) > 1 ? ` · ${reporte.totalAdhesiones} vecinos` : ''}
        </span>
        {children}
      </span>
    </>
  );
}

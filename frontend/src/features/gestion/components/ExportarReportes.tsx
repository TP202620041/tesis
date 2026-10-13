'use client';

import { AlertaError } from '@/components/ui/form';
import { useExportarReportes } from '../hooks/useExportarReportes';
import {
  FORMATOS_EXPORTACION,
  type FiltrosExportacion,
  type FormatoExportacion,
} from '../model/exportacion';

const ETIQUETA: Record<FormatoExportacion, string> = {
  CSV: 'Exportar CSV',
  XLSX: 'Exportar Excel',
};

/**
 * US-28: botones de exportación de la bandeja. Exportan con los filtros que
 * recibe, que son los activos en pantalla: el archivo contiene lo que el
 * funcionario está viendo (el orden de la tabla no aplica; el archivo va del
 * más reciente al más antiguo).
 */
export function ExportarReportes({ filtros }: { filtros: FiltrosExportacion }) {
  const { exportar, exportando, error } = useExportarReportes();

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {FORMATOS_EXPORTACION.map((formato) => (
          <button
            key={formato}
            type="button"
            disabled={exportando !== null}
            onClick={() => void exportar(filtros, formato)}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 transition
                       hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60
                       dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            {exportando === formato ? 'Exportando…' : ETIQUETA[formato]}
          </button>
        ))}
      </div>
      {error && <AlertaError mensaje={error.mensaje} detalles={error.detalles} />}
    </div>
  );
}

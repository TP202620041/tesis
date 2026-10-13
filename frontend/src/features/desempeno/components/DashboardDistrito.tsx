'use client';

import { AlertaError } from '@/components/ui/form';
import { useDashboardDistrito } from '../hooks/useDashboardDistrito';
import {
  formatearActualizacion,
  indicadoresDeDesempeno,
  indicadoresOperativos,
  type Indicador,
} from '../model/dashboard';

/**
 * US-17: dashboard del distrito del funcionario.
 *
 * Sin colores de "bueno/malo": la UI no inventa umbrales que el backend no
 * define (mismo criterio que el índice público). Todas las tarjetas usan el
 * mismo estilo neutro.
 */
export function DashboardDistrito() {
  const carga = useDashboardDistrito();

  if (carga.estado === 'cargando') {
    return (
      <p aria-live="polite" className="text-sm text-slate-600 dark:text-slate-400">
        Cargando métricas…
      </p>
    );
  }

  if (carga.estado === 'error') {
    return (
      <div className="flex flex-col gap-3">
        <AlertaError mensaje={carga.error.mensaje} detalles={carga.error.detalles} />
        <button
          type="button"
          onClick={carga.recargar}
          className="self-start text-sm font-medium text-sky-700 hover:underline dark:text-sky-400"
        >
          Reintentar
        </button>
      </div>
    );
  }

  const { resumen } = carga.datos;
  const actualizado = formatearActualizacion(resumen.calculatedAt);

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-slate-600 dark:text-slate-400">
        {resumen.distritoNombre ?? 'Tu distrito'}
        {actualizado && ` · Índice actualizado el ${actualizado}`}
      </p>

      <Seccion
        titulo="Índice de desempeño"
        nota="Los mismos datos que publica el índice ciudadano, para tu distrito."
        indicadores={indicadoresDeDesempeno(resumen)}
      />
      <Seccion
        titulo="Gestión interna"
        nota="Señales para organizar el trabajo. No se publican."
        indicadores={indicadoresOperativos(carga.datos)}
      />
    </div>
  );
}

function Seccion({
  titulo,
  nota,
  indicadores,
}: {
  titulo: string;
  nota: string;
  indicadores: Indicador[];
}) {
  const idTitulo = `seccion-${titulo.replace(/\s+/g, '-').toLowerCase()}`;
  return (
    <section aria-labelledby={idTitulo} className="flex flex-col gap-3">
      <div>
        <h2 id={idTitulo} className="text-lg font-semibold text-slate-900 dark:text-slate-100">
          {titulo}
        </h2>
        <p className="text-sm text-slate-600 dark:text-slate-400">{nota}</p>
      </div>
      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {indicadores.map((indicador) => (
          <div
            key={indicador.id}
            className="flex flex-col gap-1 rounded-md border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800"
          >
            <dt className="text-sm font-medium text-slate-600 dark:text-slate-300">
              {indicador.etiqueta}
            </dt>
            <dd className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
              {indicador.valor}
            </dd>
            <dd className="text-xs text-slate-500 dark:text-slate-400">{indicador.descripcion}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

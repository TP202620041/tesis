'use client';

import Link from 'next/link';
import { LineaDeTiempo } from '@/components/LineaDeTiempo';
import { FotoDeReporte } from '@/components/FotoDeReporte';
import { UbicacionDelReporte } from '@/components/UbicacionDelReporte';
import { estiloDeEstado } from '@/lib/types/estados';
import { textoDeSeveridad, tituloVisible } from '@/lib/types/tituloYSeveridad';
import { useMiReporte } from '../hooks/useMiReporte';
import {
  explicacionDeEstado,
  puedeCalificar,
  puedeEditar,
  tieneVistaPublica,
} from '../model/acciones';
import { Calificar } from './Calificar';
import { Comentarios } from './Comentarios';
import { EditarReporte } from './EditarReporte';

/**
 * Seguimiento de un reporte propio: estado, historial (US-22), edicion o
 * retiro (US-08) y calificacion (US-26).
 *
 * `reporteId` es `null` si el id de la URL no es valido (QA-1 M-11): se dice
 * «Reporte no disponible» sin pedir nada al API.
 */
export function DetalleMiReporte({ reporteId }: { reporteId: number | null }) {
  if (reporteId === null) return <ReporteNoDisponible />;
  return <DetalleCargado reporteId={reporteId} />;
}

function ReporteNoDisponible() {
  return (
    <main className="mx-auto flex w-full max-w-lg flex-col gap-4 px-4 py-10">
      <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
        Reporte no disponible
      </h1>
      <p className="text-slate-600 dark:text-slate-400">
        Este reporte no existe o no lo enviaste tú. Aquí solo puedes ver los tuyos.
      </p>
      <Link href="/mis-reportes" className="self-start text-sky-700 hover:underline dark:text-sky-400">
        Volver a mis reportes
      </Link>
    </main>
  );
}

function DetalleCargado({ reporteId }: { reporteId: number }) {
  const carga = useMiReporte(reporteId);

  // Tras editar o retirar se recarga mostrando "Cargando…", como antes de
  // FE-05: la pantalla se vuelve a montar con el reporte fresco y los
  // formularios hijos arrancan de cero.
  if (carga.estado === 'cargando' || carga.recargando) {
    return <p className="p-8 text-slate-600 dark:text-slate-400">Cargando…</p>;
  }

  const reporte = carga.datos?.reporte ?? null;
  if (!reporte) return <ReporteNoDisponible />;

  const entradas = carga.datos?.entradas ?? [];
  const estado = reporte.estado ?? '';
  const estilo = estiloDeEstado(estado);
  // `api.ts` ya devuelve la URL absoluta de la foto.
  const foto = reporte.fotoUrl;

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-6">
      <Link href="/mis-reportes" className="self-start text-sm text-sky-700 hover:underline dark:text-sky-400">
        ← Volver a mis reportes
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
            {tituloVisible(reporte.titulo)}
          </h1>
          <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
            {[reporte.categoriaNombre, textoDeSeveridad(reporte.severidad)]
              .filter(Boolean)
              .join(' · ')}
          </p>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            {reporte.distritoNombre} ·{' '}
            {reporte.createdAt ? new Date(reporte.createdAt).toLocaleDateString('es-PE') : '—'}
            {(reporte.totalAdhesiones ?? 1) > 1
              ? ` · ${reporte.totalAdhesiones} vecinos lo respaldan`
              : ''}
          </p>
        </div>
        <span
          className="rounded-full px-3 py-1 text-sm font-medium text-white"
          style={{ background: estilo.color }}
        >
          {estilo.etiqueta}
        </span>
      </header>

      {carga.datos?.errorDeRecarga && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950 dark:text-red-200">
          No se pudo actualizar el reporte: {carga.datos.errorDeRecarga.mensaje} Lo que ves puede
          no estar al día.
        </p>
      )}

      {/* Explica el estado en los terminos del vecino, no del funcionario. */}
      <p className="rounded-md bg-slate-100 px-3 py-2 text-sm text-slate-700 dark:bg-slate-800 dark:text-slate-300">
        {explicacionDeEstado(estado)}
      </p>

      {reporte.descripcion && (
        <p className="text-slate-700 dark:text-slate-300">{reporte.descripcion}</p>
      )}

      {foto && (
        <FotoDeReporte
          src={foto}
          alt="Foto del daño que reportaste"
          className="max-h-72 w-full rounded-md border border-slate-200 object-cover dark:border-slate-700"
          claseDelReemplazo="h-40"
        />
      )}

      <UbicacionDelReporte
        latitud={reporte.latitud}
        longitud={reporte.longitud}
        titulo={tituloVisible(reporte.titulo)}
      />

      {puedeEditar(estado) && (
        <section className="rounded-md border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
          <EditarReporte reporte={reporte} onActualizado={carga.recargar} />
        </section>
      )}

      {puedeCalificar(estado) && (
        <section className="rounded-md border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
          <Calificar reporteId={reporteId} />
        </section>
      )}

      <section className="rounded-md border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
        <h2 className="mb-3 text-sm font-semibold text-slate-900 dark:text-slate-100">
          Seguimiento
        </h2>
        <LineaDeTiempo entradas={entradas} />
      </section>

      {/* US-27: lo que opinaron los vecinos sobre la reparacion de MI
          reporte. El creador tambien puede comentar, como cualquier otro. */}
      {estado === 'RESUELTO' && (
        <section className="rounded-md border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
          <Comentarios reporteId={reporteId} puedeComentar />
        </section>
      )}

      {/* QA-1 M-13: un reporte retirado no tiene vista publica (404). */}
      {tieneVistaPublica(estado) && (
        <Link
          href={`/reportes/${reporteId}`}
          className="text-sm text-sky-700 hover:underline dark:text-sky-400"
        >
          Ver cómo lo ven los demás (vista pública)
        </Link>
      )}
    </main>
  );
}

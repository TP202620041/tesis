'use client';

import Link from 'next/link';
import { use, useCallback, useEffect, useState } from 'react';
import { LineaDeTiempo } from '@/components/LineaDeTiempo';
import { GuardiaDeRol } from '@/features/auth/components/GuardiaDeRol';
import {
  historialDeReporte,
  misReportes,
  type HistorialEntrada,
  type ReporteResumen,
} from '@/features/reportes/api';
import {
  explicacionDeEstado,
  puedeCalificar,
  puedeEditar,
} from '@/features/reportes/acciones';
import { Calificar } from '@/features/reportes/components/Calificar';
import { EditarReporte } from '@/features/reportes/components/EditarReporte';
import { estiloDeEstado } from '@/features/reportes/mapa/estados';
import { urlDeFoto } from '@/lib/api/client';

/**
 * Seguimiento de un reporte propio: estado, historial (US-22), edicion o
 * retiro (US-08) y calificacion (US-26).
 *
 * `params` se tipa a mano por el mismo motivo que en la bandeja municipal:
 * `PageProps<'/...'>` lo genera Next en el build y `tsc --noEmit` sobre un
 * checkout limpio no lo encontraria.
 */
export default function MiReportePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <GuardiaDeRol rolesPermitidos={['CIUDADANO']}>
      {() => <Detalle reporteId={Number(id)} />}
    </GuardiaDeRol>
  );
}

function Detalle({ reporteId }: { reporteId: number }) {
  const [reporte, setReporte] = useState<ReporteResumen | null>(null);
  const [entradas, setEntradas] = useState<HistorialEntrada[]>([]);
  const [cargando, setCargando] = useState(true);
  const [noEncontrado, setNoEncontrado] = useState(false);
  const [recarga, setRecarga] = useState(0);
  const recargar = useCallback(() => setRecarga((n) => n + 1), []);

  /**
   * El API no expone `GET /api/reportes/{id}`, asi que el reporte se busca
   * dentro de "mis reportes". Efecto util: si no aparece ahi es que no es
   * suyo (o no existe), que es exactamente lo que hay que decirle.
   */
  useEffect(() => {
    let cancelado = false;
    const cargar = async () => {
      setCargando(true);
      try {
        const [lista, timeline] = await Promise.all([
          misReportes(),
          historialDeReporte(reporteId).catch(() => [] as HistorialEntrada[]),
        ]);
        if (cancelado) return;
        const encontrado = lista.find((r) => r.id === reporteId) ?? null;
        setReporte(encontrado);
        setNoEncontrado(encontrado === null);
        setEntradas(timeline);
      } finally {
        if (!cancelado) setCargando(false);
      }
    };
    void cargar();
    return () => {
      cancelado = true;
    };
  }, [reporteId, recarga]);

  if (cargando) {
    return <p className="p-8 text-slate-600 dark:text-slate-400">Cargando…</p>;
  }

  if (noEncontrado || !reporte) {
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

  const estado = reporte.estado ?? '';
  const estilo = estiloDeEstado(estado);
  const foto = urlDeFoto(reporte.fotoUrl);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-6">
      <Link href="/mis-reportes" className="text-sm text-sky-700 hover:underline dark:text-sky-400">
        ← Volver a mis reportes
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
            {reporte.categoriaNombre}
          </h1>
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

      {/* Explica el estado en los terminos del vecino, no del funcionario. */}
      <p className="rounded-md bg-slate-100 px-3 py-2 text-sm text-slate-700 dark:bg-slate-800 dark:text-slate-300">
        {explicacionDeEstado(estado)}
      </p>

      {reporte.descripcion && (
        <p className="text-slate-700 dark:text-slate-300">{reporte.descripcion}</p>
      )}

      {foto && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={foto}
          alt="Foto del daño que reportaste"
          className="max-h-72 w-full rounded-md border border-slate-200 object-cover dark:border-slate-700"
        />
      )}

      {puedeEditar(estado) && (
        <section className="rounded-md border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
          <EditarReporte reporte={reporte} onActualizado={recargar} />
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
    </main>
  );
}

'use client';

import Link from 'next/link';
import { use, useCallback, useEffect, useState } from 'react';
import { GuardiaDeRol } from '@/features/auth/components/GuardiaDeRol';
import { ROLES_AREA_MUNICIPAL } from '@/features/auth/rutas';
import {
  bandeja,
  historial,
  FILTROS_BANDEJA_VACIOS,
  type HistorialEntrada,
} from '@/features/gestion/api';
import { CambiarEstado } from '@/features/gestion/components/CambiarEstado';
import { LineaDeTiempo } from '@/features/gestion/components/LineaDeTiempo';
import { Responsable } from '@/features/gestion/components/Responsable';
import { estiloDeEstado } from '@/features/reportes/mapa/estados';
import { urlDeFoto } from '@/lib/api/client';
import type { ReporteResumen } from '@/features/reportes/api';

/**
 * US-14/US-15/US-22: detalle de gestión de un reporte.
 *
 * `params` se tipa a mano en vez de usar `PageProps<'/bandeja/[id]'>`: ese
 * tipo lo genera Next durante el build, así que `tsc --noEmit` sobre un
 * checkout limpio (sin `.next/`) fallaría al no encontrar la ruta. El tipo
 * explícito no depende de artefactos generados.
 */
export default function DetalleReportePage({ params }: { params: Promise<{ id: string }> }) {
  // En Next 16 los params llegan como promesa.
  const { id } = use(params);
  const reporteId = Number(id);

  return (
    <GuardiaDeRol rolesPermitidos={ROLES_AREA_MUNICIPAL}>
      {() => <Detalle reporteId={reporteId} />}
    </GuardiaDeRol>
  );
}

function Detalle({ reporteId }: { reporteId: number }) {
  const [reporte, setReporte] = useState<ReporteResumen | null>(null);
  const [entradas, setEntradas] = useState<HistorialEntrada[]>([]);
  const [cargando, setCargando] = useState(true);
  const [noEncontrado, setNoEncontrado] = useState(false);

  // Cambiarlo fuerza a recargar tras una accion, sin que el efecto tenga
  // que escribir estado de forma sincrona (mismo patron que `useSesion`).
  const [recarga, setRecarga] = useState(0);
  const recargar = useCallback(() => setRecarga((n) => n + 1), []);

  /**
   * El API no expone `GET /api/reportes/{id}`, asi que el reporte se
   * localiza dentro de la bandeja del funcionario. Tiene un efecto util:
   * si no aparece ahi es que no pertenece a su distrito (o no existe), que
   * es exactamente lo que hay que mostrarle.
   */
  useEffect(() => {
    let cancelado = false;

    const cargar = async () => {
      setCargando(true);
      try {
        const [lista, timeline] = await Promise.all([
          bandeja(FILTROS_BANDEJA_VACIOS),
          historial(reporteId).catch(() => [] as HistorialEntrada[]),
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
          Este reporte no existe o no pertenece a tu distrito. Solo puedes gestionar los reportes
          de tu propia municipalidad.
        </p>
        <Link href="/bandeja" className="self-start text-sky-700 hover:underline dark:text-sky-400">
          Volver a la bandeja
        </Link>
      </main>
    );
  }

  const estilo = estiloDeEstado(reporte.estado ?? '');
  const foto = urlDeFoto(reporte.fotoUrl);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6">
      <Link href="/bandeja" className="text-sm text-sky-700 hover:underline dark:text-sky-400">
        ← Volver a la bandeja
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
            {reporte.categoriaNombre}
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            {reporte.distritoNombre} ·{' '}
            {reporte.createdAt ? new Date(reporte.createdAt).toLocaleDateString('es-PE') : '—'} ·{' '}
            {reporte.totalAdhesiones ?? 1}{' '}
            {(reporte.totalAdhesiones ?? 1) === 1 ? 'vecino' : 'vecinos'}
          </p>
        </div>
        <span
          className="rounded-full px-3 py-1 text-sm font-medium text-white"
          style={{ background: estilo.color }}
        >
          {estilo.etiqueta}
        </span>
      </header>

      {reporte.posibleReincidencia && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100">
          Un vecino comentó que este daño reapareció o quedó mal reparado (US-27).
        </p>
      )}

      {reporte.descripcion && (
        <p className="text-slate-700 dark:text-slate-300">{reporte.descripcion}</p>
      )}

      {foto && (
        // Foto de reporte: pública, sirve directo en <img src>.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={foto}
          alt="Foto del daño reportado"
          className="max-h-72 w-full rounded-md border border-slate-200 object-cover dark:border-slate-700"
        />
      )}

      <div className="grid gap-6 md:grid-cols-2">
        <section className="rounded-md border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
          <CambiarEstado
            reporte={reporte}
            // Recarga todo: el cambio de estado altera el historial y puede
            // habilitar o deshabilitar la asignación de responsable.
            onCambiado={recargar}
          />
        </section>

        <section className="rounded-md border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
          <Responsable reporteId={reporteId} estado={reporte.estado ?? ''} />
        </section>
      </div>

      <section className="rounded-md border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
        <h2 className="mb-3 text-sm font-semibold text-slate-900 dark:text-slate-100">
          Historial de gestión
        </h2>
        <LineaDeTiempo entradas={entradas} />
      </section>
    </main>
  );
}

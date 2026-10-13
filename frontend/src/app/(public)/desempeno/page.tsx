'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { rankingDistrital } from '@/features/desempeno/api';
import { TablaDesempeno } from '@/features/desempeno/components/TablaDesempeno';
import { ORDEN_INICIAL, type DesempenoDistrital, type Orden } from '@/features/desempeno/model/formato';
import { listarCategorias } from '@/features/reportes/api';
import type { CategoriaDano } from '@/lib/types/domain';

/**
 * US-18/US-20: indice publico de desempeno distrital.
 *
 * PUBLICA, sin sesion ni rol. Es la pieza que hace visible el proposito del
 * sistema: comparar como responde cada municipalidad a los reportes de sus
 * vecinos, con datos que los propios ciudadanos generaron.
 */
export default function DesempenoPage() {
  const [filas, setFilas] = useState<DesempenoDistrital[]>([]);
  const [categorias, setCategorias] = useState<CategoriaDano[]>([]);
  const [categoriaId, setCategoriaId] = useState<number | null>(null);
  const [orden, setOrden] = useState<Orden>(ORDEN_INICIAL);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;
    const cargar = async () => {
      const lista = await listarCategorias().catch(() => [] as CategoriaDano[]);
      if (!cancelado) setCategorias(lista);
    };
    void cargar();
    return () => {
      cancelado = true;
    };
  }, []);

  useEffect(() => {
    let cancelado = false;
    const cargar = async () => {
      setCargando(true);
      setError(null);
      try {
        const datos = await rankingDistrital(categoriaId);
        if (!cancelado) setFilas(datos);
      } catch {
        if (!cancelado) setError('No se pudo cargar el índice de desempeño.');
      } finally {
        if (!cancelado) setCargando(false);
      }
    };
    void cargar();
    return () => {
      cancelado = true;
    };
  }, [categoriaId]);

  const conDatos = filas.filter((f) => (f.totalReportes ?? 0) > 0).length;
  const calculado = filas[0]?.calculatedAt;

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
            Índice de desempeño distrital
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-600 dark:text-slate-400">
            Qué tan bien responde cada municipalidad de Lima Metropolitana a los daños viales que
            reportan sus vecinos. Los datos salen de los reportes ciudadanos y sus cambios de
            estado, no de cifras declaradas por las municipalidades.
          </p>
        </div>
        <nav className="flex gap-2">
          <Link
            href="/mapa"
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm dark:border-slate-600 dark:text-slate-200"
          >
            Ver el mapa
          </Link>
          <Link
            href="/reportar"
            className="rounded-md bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-700"
          >
            Reportar un daño
          </Link>
        </nav>
      </header>

      {error && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950 dark:text-red-200">
          {error}
        </p>
      )}

      <section className="flex flex-wrap items-end gap-4">
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="categoria"
            className="text-sm font-medium text-slate-700 dark:text-slate-200"
          >
            Tipo de daño
          </label>
          <select
            id="categoria"
            value={categoriaId ?? ''}
            onChange={(e) => setCategoriaId(e.target.value ? Number(e.target.value) : null)}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
          >
            <option value="">Todos los tipos</option>
            {categorias.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
        </div>

        <p aria-live="polite" className="pb-2 text-sm text-slate-600 dark:text-slate-400">
          {cargando
            ? 'Cargando…'
            : `${filas.length} distritos · ${conDatos} con reportes registrados`}
        </p>
      </section>

      {categoriaId != null && !cargando && (
        <p className="rounded-md bg-slate-100 px-3 py-2 text-sm text-slate-700 dark:bg-slate-800 dark:text-slate-300">
          Al filtrar por tipo de daño solo aparecen los distritos que tienen reportes de ese tipo.
        </p>
      )}

      {!cargando && filas.length === 0 && !error && (
        <p className="rounded-md border border-dashed border-slate-300 p-8 text-center text-slate-500 dark:border-slate-600">
          Todavía no hay reportes de este tipo en ningún distrito.
        </p>
      )}

      {!cargando && filas.length > 0 && (
        <TablaDesempeno filas={filas} orden={orden} onOrdenar={setOrden} />
      )}

      <footer className="flex flex-col gap-1 border-t border-slate-200 pt-4 text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400">
        <p>
          <strong>Tasa de resolución:</strong> reportes resueltos sobre el total recibido.{' '}
          <strong>Tiempo promedio:</strong> desde que se reporta el daño hasta que se marca como
          resuelto. <strong>Satisfacción:</strong> promedio de las calificaciones que dejaron los
          ciudadanos tras la atención.
        </p>
        <p>
          Los reportes que el propio ciudadano retiró no se cuentan: no llegaron a la gestión
          municipal, así que no afectan la tasa de ningún distrito.
        </p>
        {calculado && <p>Datos calculados el {new Date(calculado).toLocaleString('es-PE')}.</p>}
      </footer>
    </main>
  );
}

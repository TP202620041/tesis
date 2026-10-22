'use client';

import { useMemo, useState } from 'react';
import { useComparacionEnUrl } from '../hooks/useComparacionEnUrl';
import {
  useCategoriasDelIndice,
  useNombresDeDistritos,
  useRankingDistrital,
} from '../hooks/useIndiceDesempeno';
import { distritosComparados, MAX_COMPARAR, MIN_COMPARAR } from '../model/comparacion';
import { ORDEN_INICIAL, type Orden } from '../model/formato';
import { ComparacionDistritos } from './ComparacionDistritos';
import { TablaDesempeno } from './TablaDesempeno';

/**
 * US-18/US-19/US-20: indice publico de desempeno distrital, con filtro por
 * tipo de dano, tabla ordenable y comparacion de 2 a 4 distritos.
 *
 * El tipo de dano y los distritos comparados viven en la URL
 * (`useComparacionEnUrl`) para poder compartir la comparacion; el orden de
 * la tabla es solo de quien la mira y queda en estado local.
 */
export function IndiceDesempeno() {
  const categorias = useCategoriasDelIndice();
  const nombres = useNombresDeDistritos();
  const idsDeCategorias = useMemo(
    () => (categorias.length > 0 ? categorias.map((c) => c.id) : null),
    [categorias],
  );
  const comparacion = useComparacionEnUrl(nombres, idsDeCategorias);
  const { categoriaId } = comparacion;
  const [orden, setOrden] = useState<Orden>(ORDEN_INICIAL);
  const ranking = useRankingDistrital(categoriaId);

  const cargando = ranking.estado === 'cargando';
  const error = ranking.estado === 'error' ? 'No se pudo cargar el índice de desempeño.' : null;
  const filas = ranking.datos ?? [];
  const conDatos = filas.filter((f) => (f.totalReportes ?? 0) > 0).length;
  const calculado = filas[0]?.calculatedAt;
  const comparados = distritosComparados(comparacion.distritos, filas, nombres);
  const categoriaNombre =
    categoriaId != null ? (categorias.find((c) => c.id === categoriaId)?.nombre ?? null) : null;

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6">
      <header>
        <h1 className="text-2xl font-bold text-texto">
          Índice de desempeño distrital
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-texto-2">
          Qué tan bien responde cada municipalidad de Lima Metropolitana a los daños viales que
          reportan sus vecinos. Los datos salen de los reportes ciudadanos y sus cambios de
          estado, no de cifras declaradas por las municipalidades.
        </p>
      </header>

      {error && (
        <p role="alert" className="rounded-control bg-error-fondo px-3 py-2 text-sm text-error-texto">
          {error}
        </p>
      )}

      <section className="flex flex-wrap items-end gap-4">
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="categoria"
            className="text-sm font-medium text-texto"
          >
            Tipo de daño
          </label>
          <select
            id="categoria"
            value={categoriaId ?? ''}
            onChange={(e) =>
              comparacion.cambiarCategoria(e.target.value ? Number(e.target.value) : null)
            }
            className="min-h-objetivo bg-superficie text-texto rounded-control border border-linea-campo px-3 py-2 text-sm"
          >
            <option value="">Todos los tipos</option>
            {categorias.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
        </div>

        <p aria-live="polite" className="pb-2 text-sm text-texto-2">
          {cargando
            ? 'Cargando…'
            : `${filas.length} distritos · ${conDatos} con reportes registrados`}
        </p>
      </section>

      {categoriaId != null && !cargando && (
        <p className="rounded-control bg-superficie-2 px-3 py-2 text-sm text-texto">
          Al filtrar por tipo de daño solo aparecen los distritos que tienen reportes de ese tipo.
        </p>
      )}

      {!cargando && filas.length === 0 && !error && (
        <p className="rounded-control border border-dashed border-linea-campo p-8 text-center text-texto-2">
          Todavía no hay reportes de este tipo en ningún distrito.
        </p>
      )}

      {!cargando && !error && (
        <ComparacionDistritos
          distritos={comparados}
          categoriaNombre={categoriaNombre}
          onQuitar={comparacion.quitar}
          onLimpiar={comparacion.limpiar}
        />
      )}

      {!cargando && filas.length > 0 && (
        <>
          <p className="text-sm text-texto-2">
            Marca de {MIN_COMPARAR} a {MAX_COMPARAR} distritos en la columna «Comparar» para verlos
            lado a lado. La dirección de la página guarda la comparación: puedes compartirla.
          </p>
          {/* Siempre montado: un aviso que aparece dentro de una region viva se anuncia. */}
          <p
            role="status"
            className="text-sm font-medium text-aviso-texto empty:hidden"
          >
            {comparacion.aviso}
          </p>
          <TablaDesempeno
            filas={filas}
            orden={orden}
            onOrdenar={setOrden}
            comparados={comparacion.distritos}
            onAlternarComparacion={comparacion.alternarDistrito}
          />
        </>
      )}

      <footer className="flex flex-col gap-1 border-t border-linea pt-4 text-xs text-texto-2">
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

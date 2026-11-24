'use client';

import { useMemo, useState } from 'react';
import { Aviso } from '@/components/ui/Aviso';
import { useComparacionEnUrl } from '../hooks/useComparacionEnUrl';
import {
  useCategoriasDelIndice,
  useDashboardDeGestion,
  useNombresDeDistritos,
  usePeriodosDeGestion,
} from '../hooks/useIndiceDesempeno';
import { distritosComparados, MAX_COMPARAR, MIN_COMPARAR } from '../model/comparacion';
import { formatearActualizacion } from '../model/dashboard';
import { ORDEN_INICIAL, SIN_DATOS, type Orden } from '../model/formato';
import { etiquetaPeriodo, opcionDePeriodo, periodoElegido, periodoSinDatos } from '../model/gestion';
import { ComoSeCalcula } from './ComoSeCalcula';
import { ComparacionDistritos } from './ComparacionDistritos';
import { TablaDesempeno } from './TablaDesempeno';

const CLASES_SELECTOR =
  'min-h-objetivo bg-superficie text-texto rounded-control border border-linea-campo px-3 py-2 text-sm';

/**
 * NC-06 (indicador OE3-I5), sobre US-18/US-19/US-20: desempeño público de
 * cada municipalidad por periodo de gestión, con filtro por tipo de daño,
 * tabla ordenable, comparación de 2 a 4 distritos y la explicación de cada
 * fórmula.
 *
 * Reemplaza la tabla del índice acumulado (todos los periodos juntos, tiempo
 * en horas): ver «Desempeño por periodo de gestión» en el README.
 *
 * El periodo, el tipo de daño y los distritos comparados viven en la URL
 * (`useComparacionEnUrl`) para poder compartirlos; el orden de la tabla es
 * solo de quien la mira y queda en estado local.
 */
export function IndiceDesempeno() {
  const categorias = useCategoriasDelIndice();
  const nombres = useNombresDeDistritos();
  const periodos = usePeriodosDeGestion();
  const listaPeriodos = periodos.datos;
  const idsDeCategorias = useMemo(
    () => (categorias.length > 0 ? categorias.map((c) => c.id) : null),
    [categorias],
  );
  const idsDePeriodos = useMemo(() => listaPeriodos?.map((p) => p.id) ?? null, [listaPeriodos]);
  const comparacion = useComparacionEnUrl(nombres, idsDeCategorias, idsDePeriodos);
  const { categoriaId } = comparacion;
  const periodo = listaPeriodos ? periodoElegido(listaPeriodos, comparacion.periodoId) : null;
  const [orden, setOrden] = useState<Orden>(ORDEN_INICIAL);
  const kpis = useDashboardDeGestion(periodo?.id ?? null, categoriaId);

  const cargando = periodos.estado === 'cargando' || kpis.estado === 'cargando';
  const error =
    periodos.estado === 'error' || kpis.estado === 'error'
      ? 'No se pudo cargar el desempeño de las municipalidades.'
      : null;
  const sinPeriodos = periodos.estado === 'listo' && periodo == null;
  const dashboard = kpis.datos;
  const filas = dashboard?.distritos ?? [];
  const sinDatos = dashboard != null && periodoSinDatos(dashboard);
  const conDatos = filas.filter((f) => f.reportesValidos > 0).length;
  const calculado = formatearActualizacion(dashboard?.calculatedAt);
  const comparados = distritosComparados(comparacion.distritos, filas, nombres);
  const categoriaNombre =
    categoriaId != null ? (categorias.find((c) => c.id === categoriaId)?.nombre ?? null) : null;
  const etiqueta = periodo ? etiquetaPeriodo(periodo) : '';
  const contexto = `${etiqueta}${categoriaNombre ? ` · ${categoriaNombre}` : ''}`;
  const listo = !cargando && !error && dashboard != null;

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6">
      <header>
        <h1 className="text-2xl font-bold text-texto">Desempeño de las municipalidades</h1>
        <p className="mt-1 max-w-2xl text-sm text-texto-2">
          Qué tan bien responde cada municipalidad de Lima Metropolitana a los daños viales que
          reportan sus vecinos, en cada periodo de gestión. Los datos salen de los reportes
          ciudadanos y sus cambios de estado, no de cifras declaradas por las municipalidades.
        </p>
      </header>

      {error && (
        <p role="alert" className="rounded-control border border-error-borde bg-error-fondo px-3 py-2 text-sm text-error-texto">
          {error}
        </p>
      )}

      <section aria-label="Filtros" className="flex flex-wrap items-end gap-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="periodo" className="text-sm font-medium text-texto">
            Periodo de gestión
          </label>
          <select
            id="periodo"
            value={periodo?.id ?? ''}
            disabled={!listaPeriodos || listaPeriodos.length === 0}
            onChange={(e) => comparacion.cambiarPeriodo(e.target.value ? Number(e.target.value) : null)}
            className={CLASES_SELECTOR}
          >
            {(listaPeriodos ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {opcionDePeriodo(p)}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="categoria" className="text-sm font-medium text-texto">
            Tipo de daño
          </label>
          <select
            id="categoria"
            value={categoriaId ?? ''}
            onChange={(e) => comparacion.cambiarCategoria(e.target.value ? Number(e.target.value) : null)}
            className={CLASES_SELECTOR}
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
            : listo
              ? `${filas.length} distritos · ${conDatos} con reportes válidos en ${etiqueta}`
              : ''}
        </p>
      </section>

      {sinPeriodos && (
        <Aviso titulo={SIN_DATOS}>Todavía no hay periodos de gestión registrados.</Aviso>
      )}

      {listo && sinDatos && (
        <Aviso titulo={SIN_DATOS}>
          {categoriaNombre
            ? `Ningún distrito tiene reportes válidos de ${categoriaNombre} en el periodo ${etiqueta}.`
            : `El periodo ${etiqueta} todavía no tiene reportes válidos en ningún distrito.`}{' '}
          No es un cero: no hay con qué calcular la tasa, el tiempo ni la satisfacción.
        </Aviso>
      )}

      {listo && !sinDatos && (
        <>
          {categoriaId != null && (
            <p className="rounded-control bg-superficie-2 px-3 py-2 text-sm text-texto">
              Al filtrar por tipo de daño solo aparecen los distritos que tienen reportes válidos de
              ese tipo en el periodo.
            </p>
          )}

          <ComparacionDistritos
            distritos={comparados}
            categoriaNombre={categoriaNombre}
            periodo={etiqueta}
            onQuitar={comparacion.quitar}
            onLimpiar={comparacion.limpiar}
          />

          <p className="text-sm text-texto-2">
            Marca de {MIN_COMPARAR} a {MAX_COMPARAR} distritos en la columna «Comparar» para verlos
            lado a lado. La dirección de la página guarda el periodo, el tipo de daño y la
            comparación: puedes compartirla.
          </p>
          {/* Siempre montado: un aviso que aparece dentro de una region viva se anuncia. */}
          <p role="status" className="text-sm font-medium text-aviso-texto empty:hidden">
            {comparacion.aviso}
          </p>
          <TablaDesempeno
            filas={filas}
            orden={orden}
            onOrdenar={setOrden}
            comparados={comparacion.distritos}
            onAlternarComparacion={comparacion.alternarDistrito}
            contexto={contexto}
          />
        </>
      )}

      <ComoSeCalcula />

      {calculado && <p className="text-xs text-texto-2">Datos calculados el {calculado}.</p>}
    </main>
  );
}

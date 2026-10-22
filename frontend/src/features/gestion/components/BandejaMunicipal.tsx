'use client';

import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import { ESTADOS_EN_BANDEJA, estiloDeEstado } from '@/lib/types/estados';
import type { CategoriaDano, Usuario } from '@/lib/types/domain';
import { useBandeja, useCategoriasDelDistrito } from '../hooks/useBandeja';
import { FILTROS_BANDEJA_VACIOS, type FiltrosBandeja } from '../model/tipos';
import { ExportarReportes } from './ExportarReportes';
import { ordenar, TablaBandeja, type OrdenBandeja } from './TablaBandeja';

/**
 * US-13: bandeja de reportes del distrito del funcionario.
 *
 * La navegacion del area municipal (panel, categorias, soporte) y «Cerrar
 * sesión» son del marco comun de la app (DIS-1).
 */
export function BandejaMunicipal({ usuario }: { usuario: Usuario }) {
  const [filtros, setFiltros] = useState<FiltrosBandeja>(FILTROS_BANDEJA_VACIOS);
  const [orden, setOrden] = useState<OrdenBandeja>('apoyos');
  const categorias = useCategoriasDelDistrito(usuario.distritoId ?? null);
  const carga = useBandeja(filtros);

  const cargando = carga.estado === 'cargando';
  const error = carga.estado === 'error' ? 'No se pudo cargar la bandeja.' : null;
  const visibles = ordenar(carga.datos ?? [], orden);

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-6">
      <header>
        <h1 className="text-2xl font-bold text-texto">
          Bandeja municipal
        </h1>
        <p className="text-sm text-texto-2">
          Reportes de {usuario.distritoNombre ?? 'tu distrito'} · {usuario.nombre}{' '}
          {usuario.apellido}
        </p>
      </header>

      {error && (
        <p role="alert" className="border border-error-borde rounded-control bg-error-fondo px-3 py-2 text-sm text-error-texto">
          {error}
        </p>
      )}

      <Filtros filtros={filtros} onCambiar={setFiltros} categorias={categorias} />

      <ExportarReportes filtros={filtros} />

      <p aria-live="polite" className="text-sm text-texto-2">
        {cargando
          ? 'Cargando…'
          : `${visibles.length} ${visibles.length === 1 ? 'reporte' : 'reportes'}`}
      </p>

      {!cargando && <TablaBandeja reportes={visibles} orden={orden} onOrdenar={setOrden} />}

      <Link href="/mapa" className="text-sm text-enlace hover:underline">
        Ver el mapa público
      </Link>
    </main>
  );
}

/**
 * Filtros de la bandeja.
 *
 * NO reutiliza `PanelFiltrosMapa` de US-10: aunque se parezcan, sus formas no
 * coinciden. Aquel filtra por distrito (aqui es fijo: el del funcionario) y
 * no tiene rango de fechas; este si. Forzar un componente comun habria
 * exigido props opcionales que activan y desactivan campos, mas enredado que
 * dos componentes claros. Lo que si se comparte es `estiloDeEstado`, que es
 * donde de verdad importa no divergir.
 */
function Filtros({
  filtros,
  onCambiar,
  categorias,
}: {
  filtros: FiltrosBandeja;
  onCambiar: (f: FiltrosBandeja) => void;
  categorias: CategoriaDano[];
}) {
  const hayFiltros = Object.values(filtros).some((v) => v !== null);

  return (
    <section className="flex flex-wrap items-end gap-3 rounded-control border border-linea bg-superficie p-3">
      <Campo etiqueta="Estado" id="f-estado">
        <select
          id="f-estado"
          value={filtros.estado ?? ''}
          onChange={(e) => onCambiar({ ...filtros, estado: e.target.value || null })}
          className="min-h-objetivo rounded-control border border-linea-campo bg-superficie px-2 py-1.5 text-sm text-texto"
        >
          <option value="">Todos</option>
          {ESTADOS_EN_BANDEJA.map((estado) => (
            <option key={estado} value={estado}>
              {estiloDeEstado(estado).etiqueta}
            </option>
          ))}
        </select>
      </Campo>

      <Campo etiqueta="Tipo de daño" id="f-categoria">
        <select
          id="f-categoria"
          value={filtros.categoriaId ?? ''}
          onChange={(e) =>
            onCambiar({ ...filtros, categoriaId: e.target.value ? Number(e.target.value) : null })
          }
          className="min-h-objetivo rounded-control border border-linea-campo bg-superficie px-2 py-1.5 text-sm text-texto"
        >
          <option value="">Todos</option>
          {categorias.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
            </option>
          ))}
        </select>
      </Campo>

      <Campo etiqueta="Desde" id="f-desde">
        <input
          id="f-desde"
          type="date"
          value={filtros.fechaDesde ?? ''}
          onChange={(e) => onCambiar({ ...filtros, fechaDesde: e.target.value || null })}
          className="min-h-objetivo rounded-control border border-linea-campo bg-superficie px-2 py-1.5 text-sm text-texto"
        />
      </Campo>

      <Campo etiqueta="Hasta" id="f-hasta">
        <input
          id="f-hasta"
          type="date"
          value={filtros.fechaHasta ?? ''}
          onChange={(e) => onCambiar({ ...filtros, fechaHasta: e.target.value || null })}
          className="min-h-objetivo rounded-control border border-linea-campo bg-superficie px-2 py-1.5 text-sm text-texto"
        />
      </Campo>

      {hayFiltros && (
        <button
          type="button"
          onClick={() => onCambiar(FILTROS_BANDEJA_VACIOS)}
          className="text-sm font-medium text-enlace hover:underline"
        >
          Limpiar
        </button>
      )}
    </section>
  );
}

function Campo({
  etiqueta,
  id,
  children,
}: {
  etiqueta: string;
  id: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-xs font-medium text-texto-2">
        {etiqueta}
      </label>
      {children}
    </div>
  );
}

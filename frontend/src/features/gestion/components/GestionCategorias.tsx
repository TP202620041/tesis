'use client';

import { useState } from 'react';
import { AlertaError } from '@/components/ui/form';
import { useCambiarActivaCategoria } from '../hooks/useCambiarActivaCategoria';
import { useCategoriasGestion } from '../hooks/useCategoriasGestion';
import {
  etiquetaDeActiva,
  separarCategorias,
  type CategoriaGestion,
} from '../model/categorias';
import { FormularioCategoria } from './FormularioCategoria';

/**
 * US-29: categorías del distrito. Las estándar se listan de solo lectura;
 * las propias (activas e inactivas) se crean, editan y activan/desactivan.
 * Desactivar solo deja de ofrecerla al reportar: los reportes que ya la
 * tienen la conservan, y se puede reactivar.
 *
 * Tras cada cambio se recarga la lista sin desmontarla (`useCarga` conserva
 * los datos mientras recarga): un formulario abierto en otra fila sigue
 * abierto y con lo escrito.
 */
export function GestionCategorias() {
  const carga = useCategoriasGestion();

  if (carga.estado === 'cargando') {
    return <p className="text-slate-600 dark:text-slate-400">Cargando…</p>;
  }
  if (carga.estado === 'error') {
    return <AlertaError mensaje={carga.error.mensaje} detalles={carga.error.detalles} />;
  }

  const { estandar, propias } = separarCategorias(carga.datos);

  return (
    <div className="flex flex-col gap-8">
      {carga.recargando && (
        <p role="status" className="text-sm text-slate-500 dark:text-slate-400">
          Actualizando…
        </p>
      )}
      <section aria-labelledby="titulo-propias" className="flex flex-col gap-3">
        <h2 id="titulo-propias" className="text-lg font-semibold text-slate-900 dark:text-slate-100">
          Categorías de tu distrito
        </h2>
        {propias.length === 0 ? (
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Aún no hay categorías propias. Las que crees se ofrecerán a los vecinos que reporten en
            tu distrito.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {propias.map((c) => (
              <CategoriaPropia key={c.id} categoria={c} onCambio={carga.recargar} />
            ))}
          </ul>
        )}

        <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
          <h3 className="mb-3 text-sm font-semibold text-slate-900 dark:text-slate-100">
            Nueva categoría
          </h3>
          <FormularioCategoria onGuardado={carga.recargar} />
        </div>
      </section>

      <section aria-labelledby="titulo-estandar" className="flex flex-col gap-3">
        <h2 id="titulo-estandar" className="text-lg font-semibold text-slate-900 dark:text-slate-100">
          Categorías estándar
        </h2>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Comunes a todos los distritos; no se pueden editar ni desactivar.
        </p>
        <ul className="flex flex-col gap-1">
          {estandar.map((c) => (
            <li key={c.id} className="text-sm text-slate-800 dark:text-slate-200">
              <strong>{c.nombre}</strong>
              {c.descripcion && (
                <span className="text-slate-600 dark:text-slate-400"> — {c.descripcion}</span>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function CategoriaPropia({
  categoria,
  onCambio,
}: {
  categoria: CategoriaGestion;
  onCambio: () => void;
}) {
  const [editando, setEditando] = useState(false);
  const activa = useCambiarActivaCategoria();

  async function alternar() {
    if (await activa.cambiar(categoria.id, !categoria.activo)) onCambio();
  }

  return (
    <li className="flex flex-col gap-2 rounded-md border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-800">
      {editando ? (
        <FormularioCategoria
          categoria={categoria}
          onGuardado={() => {
            setEditando(false);
            onCambio();
          }}
          onCancelar={() => setEditando(false)}
        />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <strong className="text-slate-900 dark:text-slate-100">{categoria.nombre}</strong>
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                categoria.activo
                  ? 'bg-emerald-100 text-emerald-900 dark:bg-emerald-900 dark:text-emerald-100'
                  : 'bg-slate-200 text-slate-800 dark:bg-slate-700 dark:text-slate-100'
              }`}
            >
              {etiquetaDeActiva(categoria.activo)}
            </span>
          </div>
          {categoria.descripcion && (
            <p className="text-sm text-slate-600 dark:text-slate-400">{categoria.descripcion}</p>
          )}
          {!categoria.activo && (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              No se ofrece al reportar. Los reportes que ya la tienen la conservan.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setEditando(true)}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm dark:border-slate-600 dark:text-slate-200"
            >
              Editar
            </button>
            <button
              type="button"
              onClick={() => void alternar()}
              disabled={activa.enviando}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm disabled:opacity-60 dark:border-slate-600 dark:text-slate-200"
            >
              {categoria.activo ? 'Desactivar' : 'Reactivar'}
            </button>
          </div>
          {activa.error && (
            <AlertaError mensaje={activa.error.mensaje} detalles={activa.error.detalles} />
          )}
        </>
      )}
    </li>
  );
}

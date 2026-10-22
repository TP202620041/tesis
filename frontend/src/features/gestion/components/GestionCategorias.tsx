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
import { clasesDeBoton } from '@/components/ui/Boton';

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
    return <p className="text-texto-2">Cargando…</p>;
  }
  if (carga.estado === 'error') {
    return <AlertaError mensaje={carga.error.mensaje} detalles={carga.error.detalles} />;
  }

  const { estandar, propias } = separarCategorias(carga.datos);

  return (
    <div className="flex flex-col gap-8">
      {carga.recargando && (
        <p role="status" className="text-sm text-texto-2">
          Actualizando…
        </p>
      )}
      <section aria-labelledby="titulo-propias" className="flex flex-col gap-3">
        <h2 id="titulo-propias" className="text-lg font-semibold text-texto">
          Categorías de tu distrito
        </h2>
        {propias.length === 0 ? (
          <p className="text-sm text-texto-2">
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

        <div className="rounded-tarjeta border border-linea bg-superficie p-4">
          <h3 className="mb-3 text-sm font-semibold text-texto">
            Nueva categoría
          </h3>
          <FormularioCategoria onGuardado={carga.recargar} />
        </div>
      </section>

      <section aria-labelledby="titulo-estandar" className="flex flex-col gap-3">
        <h2 id="titulo-estandar" className="text-lg font-semibold text-texto">
          Categorías estándar
        </h2>
        <p className="text-sm text-texto-2">
          Comunes a todos los distritos; no se pueden editar ni desactivar.
        </p>
        <ul className="flex flex-col gap-1">
          {estandar.map((c) => (
            <li key={c.id} className="text-sm text-texto">
              <strong>{c.nombre}</strong>
              {c.descripcion && (
                <span className="text-texto-2"> — {c.descripcion}</span>
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
    <li className="flex flex-col gap-2 rounded-control border border-linea bg-superficie p-3">
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
            <strong className="text-texto">{categoria.nombre}</strong>
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                categoria.activo
                  ? 'bg-exito-fondo text-exito-texto'
                  : 'bg-superficie-2 text-texto'
              }`}
            >
              {etiquetaDeActiva(categoria.activo)}
            </span>
          </div>
          {categoria.descripcion && (
            <p className="text-sm text-texto-2">{categoria.descripcion}</p>
          )}
          {!categoria.activo && (
            <p className="text-xs text-texto-2">
              No se ofrece al reportar. Los reportes que ya la tienen la conservan.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setEditando(true)}
              className={clasesDeBoton('secundario', 'compacto')}
            >
              Editar
            </button>
            <button
              type="button"
              onClick={() => void alternar()}
              disabled={activa.enviando}
              className={clasesDeBoton('secundario', 'compacto')}
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

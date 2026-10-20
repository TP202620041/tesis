'use client';

import { useEffect, useState } from 'react';
import { AlertaError, Boton } from '@/components/ui/form';
import { ApiError, NetworkError } from '@/lib/api/client';
import { cancelarReporte, editarReporte, listarCategorias } from '../api';
import { cambiosDeEdicion, etiquetaDeOpcion, opcionesDeCategoria } from '../model/edicion';
import type { ReporteResumen } from '../model/tipos';
import type { CategoriaDano } from '@/lib/types/domain';

/**
 * US-08: el creador edita o retira su reporte mientras sigue PENDIENTE.
 *
 * Solo se monta cuando el estado lo permite (ver `acciones.ts`); el backend
 * valida igual y responde 403 (no eres el creador) o 409 (ya no esta
 * PENDIENTE) si algo cambio mientras la pantalla estaba abierta.
 */
export function EditarReporte({
  reporte,
  onActualizado,
}: {
  reporte: ReporteResumen;
  onActualizado: () => void;
}) {
  const [categoriaId, setCategoriaId] = useState<number | null>(reporte.categoriaId ?? null);
  const [descripcion, setDescripcion] = useState(reporte.descripcion ?? '');
  const [categorias, setCategorias] = useState<CategoriaDano[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [confirmandoRetiro, setConfirmandoRetiro] = useState(false);
  const [error, setError] = useState<{ mensaje: string; detalles: string[] } | null>(null);

  // Categorias validas para el distrito del reporte (US-29): una
  // personalizada de otro distrito seria rechazada con 409.
  useEffect(() => {
    let cancelado = false;
    const cargar = async () => {
      const lista = await listarCategorias(reporte.distritoId ?? null).catch(
        () => [] as CategoriaDano[],
      );
      if (!cancelado) setCategorias(lista);
    };
    void cargar();
    return () => {
      cancelado = true;
    };
  }, [reporte.distritoId]);

  // Una categoría desactivada (US-29) ya no viene en el catálogo, pero sigue
  // siendo la del reporte: se muestra igual, seleccionada.
  const opciones = opcionesDeCategoria(categorias, {
    id: reporte.categoriaId ?? null,
    nombre: reporte.categoriaNombre ?? null,
  });

  function manejarError(e: unknown) {
    if (e instanceof NetworkError) {
      setError({ mensaje: 'Sin conexión con el servidor.', detalles: [] });
    } else if (e instanceof ApiError) {
      setError({ mensaje: e.message, detalles: e.details });
    } else {
      setError({ mensaje: 'Ocurrió un error inesperado.', detalles: [] });
    }
  }

  async function guardar(evento: React.FormEvent) {
    evento.preventDefault();
    setError(null);
    setEnviando(true);
    try {
      // US-29: no se reenvía la categoría si no cambió (puede estar
      // desactivada; el backend lo acepta, pero no hace falta).
      await editarReporte(
        reporte.id ?? 0,
        cambiosDeEdicion(reporte.categoriaId ?? null, categoriaId, descripcion),
      );
      onActualizado();
    } catch (e) {
      manejarError(e);
    } finally {
      setEnviando(false);
    }
  }

  async function retirar() {
    setError(null);
    setEnviando(true);
    try {
      await cancelarReporte(reporte.id ?? 0);
      onActualizado();
    } catch (e) {
      manejarError(e);
    } finally {
      setEnviando(false);
      setConfirmandoRetiro(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={guardar} className="flex flex-col gap-3" noValidate>
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
          Editar mi reporte
        </h2>
        {error && <AlertaError mensaje={error.mensaje} detalles={error.detalles} />}

        <div className="flex flex-col gap-1.5">
          <label htmlFor="cat-edit" className="text-sm text-slate-700 dark:text-slate-200">
            Tipo de daño
          </label>
          <select
            id="cat-edit"
            value={categoriaId ?? ''}
            onChange={(e) => setCategoriaId(e.target.value ? Number(e.target.value) : null)}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
          >
            {opciones.map((o) => (
              <option key={o.id} value={o.id}>
                {etiquetaDeOpcion(o)}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="desc-edit" className="text-sm text-slate-700 dark:text-slate-200">
            Descripción
          </label>
          <textarea
            id="desc-edit"
            rows={3}
            maxLength={500}
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
          />
        </div>

        <Boton cargando={enviando}>Guardar cambios</Boton>
      </form>

      <div className="border-t border-slate-200 pt-3 dark:border-slate-700">
        {confirmandoRetiro ? (
          <div className="flex flex-col gap-2">
            {/* La advertencia sobre los adheridos es importante: retirar
                cancela el reporte para TODOS los vecinos que lo respaldaron,
                no solo desvincula a quien lo creo (decision de US-08). */}
            <p className="text-sm text-slate-700 dark:text-slate-300">
              ¿Seguro que quieres retirar este reporte?
              {(reporte.totalAdhesiones ?? 1) > 1 && (
                <>
                  {' '}
                  Lo respaldan <strong>{reporte.totalAdhesiones} vecinos</strong> y se cancelará
                  para todos ellos.
                </>
              )}{' '}
              No se puede deshacer.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => void retirar()}
                disabled={enviando}
                className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60"
              >
                Sí, retirar
              </button>
              <button
                type="button"
                onClick={() => setConfirmandoRetiro(false)}
                className="rounded-md border border-slate-300 px-3 py-1.5 text-sm dark:border-slate-600 dark:text-slate-200"
              >
                No
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmandoRetiro(true)}
            className="text-sm font-medium text-red-700 hover:underline dark:text-red-400"
          >
            Retirar este reporte
          </button>
        )}
      </div>
    </div>
  );
}

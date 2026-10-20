'use client';

import { useState } from 'react';
import { AlertaError, Boton } from '@/components/ui/form';
import { useEditarReporte } from '../hooks/useEditarReporte';
import { etiquetaDeOpcion } from '../model/edicion';
import type { ReporteResumen } from '../model/tipos';

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
  const { opciones, guardar: guardarCambios, retirar: retirarReporte, enviando, error } =
    useEditarReporte(reporte);
  const [categoriaId, setCategoriaId] = useState<number | null>(reporte.categoriaId ?? null);
  const [descripcion, setDescripcion] = useState(reporte.descripcion ?? '');
  const [confirmandoRetiro, setConfirmandoRetiro] = useState(false);

  async function guardar(evento: React.FormEvent) {
    evento.preventDefault();
    if (await guardarCambios(categoriaId, descripcion)) onActualizado();
  }

  async function retirar() {
    const retirado = await retirarReporte();
    setConfirmandoRetiro(false);
    if (retirado) onActualizado();
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

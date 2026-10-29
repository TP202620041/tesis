'use client';

import { useState } from 'react';
import { AlertaError, Boton, CLASE_CONTROL_INVALIDO, ErrorDelCampo } from '@/components/ui/form';
import type { Severidad } from '@/lib/types/domain';
import { errorDelCampo } from '@/lib/types/moderacion';
import { useEditarReporte } from '../hooks/useEditarReporte';
import { etiquetaDeOpcion } from '../model/edicion';
import { errorDelTitulo } from '../model/titulo';
import type { ReporteResumen } from '../model/tipos';
import { CampoSeveridad, CampoTitulo } from './CamposTituloYSeveridad';
import { clasesDeBoton } from '@/components/ui/Boton';

/**
 * US-08: el creador edita o retira su reporte mientras sigue PENDIENTE.
 *
 * Solo se monta cuando el estado lo permite (ver `acciones.ts`); el backend
 * valida igual y responde 403 (no eres el creador) o 409 (ya no esta
 * PENDIENTE) si algo cambio mientras la pantalla estaba abierta.
 *
 * NC-10c: si la moderacion rechaza el titulo o la descripcion (400
 * `TEXTO_NO_PERMITIDO`), el mensaje va en ese campo mientras diga lo mismo.
 */
export function EditarReporte({
  reporte,
  onActualizado,
}: {
  reporte: ReporteResumen;
  onActualizado: () => void;
}) {
  const {
    opciones,
    guardar: guardarCambios,
    retirar: retirarReporte,
    enviando,
    error,
    textoRechazado,
  } = useEditarReporte(reporte);
  const [categoriaId, setCategoriaId] = useState<number | null>(reporte.categoriaId ?? null);
  const [titulo, setTitulo] = useState(reporte.titulo ?? '');
  const [severidad, setSeveridad] = useState<Severidad | null>(reporte.severidad ?? null);
  const [descripcion, setDescripcion] = useState(reporte.descripcion ?? '');
  const [intentado, setIntentado] = useState(false);
  // Solo se valida el titulo si cambio (en el PATCH, lo que no cambia no viaja).
  const tituloCambio = titulo.trim() !== (reporte.titulo ?? '').trim();
  const errorTitulo =
    (intentado && tituloCambio ? errorDelTitulo(titulo) : null) ??
    errorDelCampo(textoRechazado, 'titulo', titulo);
  const errorDescripcion = errorDelCampo(textoRechazado, 'descripcion', descripcion);
  const [confirmandoRetiro, setConfirmandoRetiro] = useState(false);

  async function guardar(evento: React.FormEvent) {
    evento.preventDefault();
    setIntentado(true);
    if (tituloCambio && errorDelTitulo(titulo)) return;
    if (await guardarCambios({ categoriaId, titulo, severidad, descripcion })) onActualizado();
  }

  async function retirar() {
    const retirado = await retirarReporte();
    setConfirmandoRetiro(false);
    if (retirado) onActualizado();
  }

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={guardar} className="flex flex-col gap-3" noValidate>
        <h2 className="text-sm font-semibold text-texto">
          Editar mi reporte
        </h2>
        {error && <AlertaError mensaje={error.mensaje} detalles={error.detalles} />}

        <CampoTitulo id="titulo-edit" valor={titulo} onCambiar={setTitulo} error={errorTitulo} />

        <CampoSeveridad nombre="severidad-edit" valor={severidad} onCambiar={setSeveridad} />

        <div className="flex flex-col gap-1.5">
          <label htmlFor="cat-edit" className="text-sm text-texto">
            Tipo de daño
          </label>
          <select
            id="cat-edit"
            value={categoriaId ?? ''}
            onChange={(e) => setCategoriaId(e.target.value ? Number(e.target.value) : null)}
            className="min-h-objetivo bg-superficie text-texto rounded-control border border-linea-campo px-3 py-2 text-sm"
          >
            {opciones.map((o) => (
              <option key={o.id} value={o.id}>
                {etiquetaDeOpcion(o)}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="desc-edit" className="text-sm text-texto">
            Descripción
          </label>
          <textarea
            id="desc-edit"
            rows={3}
            maxLength={500}
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            aria-invalid={errorDescripcion ? true : undefined}
            aria-describedby={errorDescripcion ? 'desc-edit-error' : undefined}
            className={`bg-superficie text-texto rounded-control border border-linea-campo px-3 py-2 text-sm ${CLASE_CONTROL_INVALIDO}`}
          />
          {errorDescripcion && <ErrorDelCampo id="desc-edit-error" mensaje={errorDescripcion} />}
        </div>

        <Boton cargando={enviando}>Guardar cambios</Boton>
      </form>

      <div className="border-t border-linea pt-3">
        {confirmandoRetiro ? (
          <div className="flex flex-col gap-2">
            {/* La advertencia sobre los adheridos es importante: retirar
                cancela el reporte para TODOS los vecinos que lo respaldaron,
                no solo desvincula a quien lo creo (decision de US-08). */}
            <p className="text-sm text-texto">
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
                className={clasesDeBoton('peligro', 'compacto')}
              >
                Sí, retirar
              </button>
              <button
                type="button"
                onClick={() => setConfirmandoRetiro(false)}
                className={clasesDeBoton('secundario', 'compacto')}
              >
                No
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmandoRetiro(true)}
            className="text-sm font-medium text-error hover:underline"
          >
            Retirar este reporte
          </button>
        )}
      </div>
    </div>
  );
}

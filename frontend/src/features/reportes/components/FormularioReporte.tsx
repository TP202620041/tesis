'use client';

import { useState } from 'react';
import { AlertaError, Boton } from '@/components/ui/form';
import { useCategoriasDeReporte } from '../hooks/useCategoriasDeReporte';
import { useCrearReporte } from '../hooks/useCrearReporte';
import type { ReporteCreado } from '../model/tipos';
import { CampoFoto } from './CampoFoto';
import { CampoUbicacion, type UbicacionElegida } from './CampoUbicacion';

/**
 * US-05: crear un reporte con foto, categoría y GPS.
 *
 * US-06: sin conexión, el reporte se guarda en el dispositivo con su
 * `Idempotency-Key` (`onEncolado`) y se envía solo al volver la señal. La
 * clave y el envío los lleva `useCrearReporte`.
 */
export function FormularioReporte({
  usuarioId,
  onCreado,
  onEncolado,
}: {
  usuarioId: number;
  onCreado: (r: ReporteCreado) => void;
  onEncolado: () => void;
}) {
  const { enviar: enviarReporte, enviando, error } = useCrearReporte(usuarioId);
  const [ubicacion, setUbicacion] = useState<UbicacionElegida | null>(null);
  const [categoriaElegida, setCategoriaElegida] = useState<number | null>(null);
  const [descripcion, setDescripcion] = useState('');
  const [foto, setFoto] = useState<File | null>(null);

  const distritoId = ubicacion?.distrito?.id ?? null;

  /**
   * Las categorias dependen del distrito (US-29) y se recargan cuando cambia
   * la ubicacion. Si la elegida no es valida en el distrito nuevo, cuenta
   * como no elegida en vez de dejar que el POST falle con 409.
   */
  const categorias = useCategoriasDeReporte(distritoId);
  const categoriaId = categorias.some((c) => c.id === categoriaElegida) ? categoriaElegida : null;

  const fueraDeCobertura = ubicacion != null && ubicacion.distrito === null;
  const puedeEnviar = ubicacion != null && !fueraDeCobertura && categoriaId != null && !enviando;

  async function enviar(evento: React.FormEvent) {
    evento.preventDefault();
    const desenlace = await enviarReporte({
      ubicacion: ubicacion && {
        latitud: ubicacion.coordenadas.latitud,
        longitud: ubicacion.coordenadas.longitud,
        manual: ubicacion.manual,
      },
      categoriaId,
      descripcion,
      foto,
    });
    if (desenlace?.tipo === 'creado') onCreado(desenlace.reporte);
    else if (desenlace?.tipo === 'encolado') onEncolado();
  }

  return (
    <form onSubmit={enviar} className="flex flex-col gap-6" noValidate>
      {error && <AlertaError mensaje={error.mensaje} detalles={error.detalles} />}

      <CampoUbicacion valor={ubicacion} onCambiar={setUbicacion} />

      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="categoriaId"
          className="text-sm font-medium text-slate-700 dark:text-slate-200"
        >
          Tipo de daño
        </label>
        <select
          id="categoriaId"
          required
          value={categoriaId ?? ''}
          onChange={(e) => setCategoriaElegida(e.target.value ? Number(e.target.value) : null)}
          className="rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900
                     focus:border-sky-500 focus:ring-2 focus:ring-sky-500/30
                     dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
        >
          <option value="">Selecciona…</option>
          {categorias.map((categoria) => (
            <option key={categoria.id} value={categoria.id}>
              {categoria.nombre}
              {!categoria.esEstandar ? ' (propia del distrito)' : ''}
            </option>
          ))}
        </select>
        {!distritoId && (
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Al indicar la ubicación podrían aparecer categorías propias de tu distrito.
          </p>
        )}
      </div>

      <CampoFoto valor={foto} onCambiar={setFoto} />

      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="descripcion"
          className="text-sm font-medium text-slate-700 dark:text-slate-200"
        >
          Descripción <span className="font-normal text-slate-500">(opcional)</span>
        </label>
        <textarea
          id="descripcion"
          rows={3}
          maxLength={500}
          value={descripcion}
          onChange={(e) => setDescripcion(e.target.value)}
          placeholder="Ej.: bache profundo en el carril derecho, frente al parque."
          className="rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900
                     focus:border-sky-500 focus:ring-2 focus:ring-sky-500/30
                     dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
        />
      </div>

      <Boton cargando={enviando} disabled={!puedeEnviar}>
        Enviar reporte
      </Boton>
    </form>
  );
}

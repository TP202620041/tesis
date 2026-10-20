'use client';

import { useEffect, useState } from 'react';
import { AlertaError, Boton } from '@/components/ui/form';
import { ApiError, NetworkError } from '@/lib/api/client';
import { crearReporte, listarCategorias } from '../api';
import type { ReporteCreado } from '../model/tipos';
import { CampoFoto } from './CampoFoto';
import { CampoUbicacion, type UbicacionElegida } from './CampoUbicacion';
import type { CategoriaDano } from '@/lib/types/domain';

/** US-05: crear un reporte con foto, categoría y GPS. */
export function FormularioReporte({ onCreado }: { onCreado: (r: ReporteCreado) => void }) {
  const [ubicacion, setUbicacion] = useState<UbicacionElegida | null>(null);
  const [categorias, setCategorias] = useState<CategoriaDano[]>([]);
  const [categoriaId, setCategoriaId] = useState<number | null>(null);
  const [descripcion, setDescripcion] = useState('');
  const [foto, setFoto] = useState<File | null>(null);
  const [error, setError] = useState<{ mensaje: string; detalles: string[] } | null>(null);
  const [enviando, setEnviando] = useState(false);

  /**
   * Clave de idempotencia del INTENTO (US-06), no de la peticion: se genera
   * una vez por formulario y solo se renueva tras un envio exitoso. Asi, si
   * el usuario reintenta porque la respuesta no llego, el backend reconoce
   * que es el mismo reporte y devuelve la respuesta original en vez de
   * duplicarlo o rechazarlo con el 409 de acumulacion de US-09.
   */
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());

  const distritoId = ubicacion?.distrito?.id ?? null;

  /**
   * Las categorias dependen del distrito: sin el, el backend solo devuelve
   * las 6 estandar; con el, agrega las personalizadas de esa municipalidad
   * (US-29). Por eso se recargan cuando cambia la ubicacion.
   */
  useEffect(() => {
    let cancelado = false;
    const cargar = async () => {
      try {
        const lista = await listarCategorias(distritoId);
        if (cancelado) return;
        setCategorias(lista);
        // Si la categoria elegida ya no es valida en este distrito, se limpia
        // en vez de dejar que el POST falle con 409.
        setCategoriaId((actual) =>
          actual != null && lista.some((c) => c.id === actual) ? actual : null,
        );
      } catch {
        if (!cancelado) setCategorias([]);
      }
    };
    void cargar();
    return () => {
      cancelado = true;
    };
  }, [distritoId]);

  const fueraDeCobertura = ubicacion != null && ubicacion.distrito === null;
  const puedeEnviar = ubicacion != null && !fueraDeCobertura && categoriaId != null && !enviando;

  async function enviar(evento: React.FormEvent) {
    evento.preventDefault();
    setError(null);

    // El backend responde 400 si faltan coordenadas; se evita el viaje.
    if (!ubicacion) {
      setError({
        mensaje: 'Indica dónde está el daño: usa tu GPS o márcalo en el mapa.',
        detalles: [],
      });
      return;
    }
    if (categoriaId == null) {
      setError({ mensaje: 'Elige el tipo de daño.', detalles: [] });
      return;
    }

    setEnviando(true);
    try {
      const creado = await crearReporte({
        latitud: ubicacion.coordenadas.latitud,
        longitud: ubicacion.coordenadas.longitud,
        categoriaId,
        descripcion,
        ubicacionManual: ubicacion.manual,
        foto,
        idempotencyKey,
      });
      // Envio exitoso: el siguiente reporte es un intento logico distinto.
      setIdempotencyKey(crypto.randomUUID());
      onCreado(creado);
    } catch (e) {
      if (e instanceof NetworkError) {
        // La cola offline de US-06 es un slice propio; por ahora se avisa y
        // se conserva la clave para que el reintento manual sea idempotente.
        setError({
          mensaje:
            'Sin conexión. Tu reporte no se envió — vuelve a intentarlo cuando tengas señal.',
          detalles: [],
        });
      } else if (e instanceof ApiError) {
        // 409 = fuera de cobertura o ya reportaste este daño (US-09).
        // 400 = validación (coordenadas faltantes o fuera de rango).
        setError({ mensaje: e.message, detalles: e.details });
      } else {
        setError({ mensaje: 'Ocurrió un error inesperado.', detalles: [] });
      }
    } finally {
      setEnviando(false);
    }
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
          onChange={(e) => setCategoriaId(e.target.value ? Number(e.target.value) : null)}
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

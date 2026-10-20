'use client';

import { useEffect, useState } from 'react';
import { AlertaError, Boton, Campo } from '@/components/ui/form';
import { ApiError, NetworkError } from '@/lib/api/client';
import { asignarResponsable, responsableActivo } from '../api';
import type { AsignacionResponsable } from '../model/tipos';
import { admiteResponsable } from '../model/transiciones';

/**
 * US-15: responsable interno del reporte.
 *
 * Es texto libre (cuadrilla o persona), no un usuario del sistema: no existe
 * un rol de cuadrilla en el modelo. Reasignar no borra el historial — el
 * backend desactiva la asignacion vigente y crea una nueva.
 */
export function Responsable({ reporteId, estado }: { reporteId: number; estado: string }) {
  const [actual, setActual] = useState<AsignacionResponsable | null>(null);
  const [cargando, setCargando] = useState(true);
  const [nombre, setNombre] = useState('');
  const [notas, setNotas] = useState('');
  const [error, setError] = useState<{ mensaje: string; detalles: string[] } | null>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    let cancelado = false;
    const cargar = async () => {
      setCargando(true);
      try {
        const asignacion = await responsableActivo(reporteId);
        if (!cancelado) setActual(asignacion);
      } catch {
        if (!cancelado) setActual(null);
      } finally {
        if (!cancelado) setCargando(false);
      }
    };
    void cargar();
    return () => {
      cancelado = true;
    };
  }, [reporteId, estado]);

  const puedeAsignar = admiteResponsable(estado);

  async function enviar(evento: React.FormEvent) {
    evento.preventDefault();
    setError(null);
    if (!nombre.trim()) return;

    setEnviando(true);
    try {
      const asignacion = await asignarResponsable(reporteId, nombre, notas);
      setActual(asignacion);
      setNombre('');
      setNotas('');
    } catch (e) {
      if (e instanceof NetworkError) {
        setError({ mensaje: 'Sin conexión con el servidor.', detalles: [] });
      } else if (e instanceof ApiError) {
        // 409 = el estado no admite asignación; 403 = otro distrito.
        setError({ mensaje: e.message, detalles: e.details });
      } else {
        setError({ mensaje: 'Ocurrió un error inesperado.', detalles: [] });
      }
    } finally {
      setEnviando(false);
    }
  }

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
        Responsable interno
      </h2>

      {cargando ? (
        <p className="text-sm text-slate-500">Cargando…</p>
      ) : actual ? (
        <div className="rounded-md border border-slate-200 p-3 text-sm dark:border-slate-700">
          <p className="font-medium text-slate-900 dark:text-slate-100">{actual.responsable}</p>
          {actual.notas && <p className="text-slate-600 dark:text-slate-400">{actual.notas}</p>}
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Asignado el{' '}
            {actual.createdAt ? new Date(actual.createdAt).toLocaleDateString('es-PE') : '—'}
          </p>
        </div>
      ) : (
        <p className="text-sm text-slate-500 dark:text-slate-400">Sin responsable asignado.</p>
      )}

      {puedeAsignar ? (
        <form onSubmit={enviar} className="flex flex-col gap-3" noValidate>
          {error && <AlertaError mensaje={error.mensaje} detalles={error.detalles} />}
          <Campo
            id="responsable"
            etiqueta={actual ? 'Reasignar a' : 'Asignar a'}
            required
            maxLength={150}
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Ej.: Cuadrilla 3 — Obras Públicas"
          />
          <Campo
            id="notas"
            etiqueta="Notas (opcional)"
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            placeholder="Instrucciones internas…"
          />
          <Boton cargando={enviando} disabled={!nombre.trim()}>
            {actual ? 'Reasignar' : 'Asignar'}
          </Boton>
        </form>
      ) : (
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Solo se puede asignar un responsable cuando el reporte está recibido o en proceso.
        </p>
      )}
    </section>
  );
}

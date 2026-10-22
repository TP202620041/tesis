'use client';

import { useState } from 'react';
import { AlertaError, Boton, Campo } from '@/components/ui/form';
import { useResponsable } from '../hooks/useResponsable';
import { admiteResponsable } from '../model/transiciones';

/**
 * US-15: responsable interno del reporte.
 *
 * Es texto libre (cuadrilla o persona), no un usuario del sistema: no existe
 * un rol de cuadrilla en el modelo. Reasignar no borra el historial — el
 * backend desactiva la asignacion vigente y crea una nueva.
 */
export function Responsable({ reporteId, estado }: { reporteId: number; estado: string }) {
  const { cargando, actual, asignar, enviando, error } = useResponsable(reporteId, estado);
  const [nombre, setNombre] = useState('');
  const [notas, setNotas] = useState('');

  const puedeAsignar = admiteResponsable(estado);

  async function enviar(evento: React.FormEvent) {
    evento.preventDefault();
    if (await asignar(nombre, notas)) {
      setNombre('');
      setNotas('');
    }
  }

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold text-texto">
        Responsable interno
      </h2>

      {cargando ? (
        <p className="text-sm text-texto-2">Cargando…</p>
      ) : actual ? (
        <div className="rounded-control border border-linea p-3 text-sm">
          <p className="font-medium text-texto">{actual.responsable}</p>
          {actual.notas && <p className="text-texto-2">{actual.notas}</p>}
          <p className="mt-1 text-xs text-texto-2">
            Asignado el{' '}
            {actual.createdAt ? new Date(actual.createdAt).toLocaleDateString('es-PE') : '—'}
          </p>
        </div>
      ) : (
        <p className="text-sm text-texto-2">Sin responsable asignado.</p>
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
        <p className="text-xs text-texto-2">
          Solo se puede asignar un responsable cuando el reporte está recibido o en proceso.
        </p>
      )}
    </section>
  );
}

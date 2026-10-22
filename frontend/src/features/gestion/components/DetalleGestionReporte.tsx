'use client';

import Link from 'next/link';
import { LineaDeTiempo } from '@/components/LineaDeTiempo';
import { FotoDeReporte } from '@/components/FotoDeReporte';
import { UbicacionDelReporte } from '@/components/UbicacionDelReporte';
import { ChipEstado } from '@/components/ui/ChipEstado';
import { textoDeSeveridad, tituloVisible } from '@/lib/types/tituloYSeveridad';
import { useDetalleGestion } from '../hooks/useDetalleGestion';
import { CambiarEstado } from './CambiarEstado';
import { Responsable } from './Responsable';

/**
 * US-14/US-15/US-22: detalle de gestión de un reporte.
 *
 * `reporteId` es `null` si el id de la URL no es valido (QA-1 M-11): se dice
 * «Reporte no disponible» sin pedir nada al API.
 */
export function DetalleGestionReporte({ reporteId }: { reporteId: number | null }) {
  if (reporteId === null) return <ReporteNoDisponible />;
  return <DetalleCargado reporteId={reporteId} />;
}

function ReporteNoDisponible() {
  return (
    <main className="mx-auto flex w-full max-w-lg flex-col gap-4 px-4 py-10">
      <h1 className="text-xl font-semibold text-texto">
        Reporte no disponible
      </h1>
      <p className="text-texto-2">
        Este reporte no existe o no pertenece a tu distrito. Solo puedes gestionar los reportes
        de tu propia municipalidad.
      </p>
      <Link href="/bandeja" className="self-start text-enlace hover:underline">
        Volver a la bandeja
      </Link>
    </main>
  );
}

function DetalleCargado({ reporteId }: { reporteId: number }) {
  const carga = useDetalleGestion(reporteId);

  // Tras cambiar el estado se recarga mostrando "Cargando…", como antes de
  // FE-05: la pantalla se vuelve a montar con el reporte fresco y los
  // formularios de gestión arrancan de cero.
  if (carga.estado === 'cargando' || carga.recargando) {
    return <p className="p-8 text-texto-2">Cargando…</p>;
  }

  const reporte = carga.datos?.reporte ?? null;
  if (!reporte) return <ReporteNoDisponible />;

  const entradas = carga.datos?.entradas ?? [];
  // `api.ts` ya devuelve la URL absoluta de la foto.
  const foto = reporte.fotoUrl;

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6">
      <Link href="/bandeja" className="text-sm text-enlace hover:underline">
        ← Volver a la bandeja
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-texto">
            {tituloVisible(reporte.titulo)}
          </h1>
          <p className="text-sm font-medium text-texto">
            {[reporte.categoriaNombre, textoDeSeveridad(reporte.severidad)]
              .filter(Boolean)
              .join(' · ')}
          </p>
          <p className="text-sm text-texto-2">
            {reporte.distritoNombre} ·{' '}
            {reporte.createdAt ? new Date(reporte.createdAt).toLocaleDateString('es-PE') : '—'} ·{' '}
            {reporte.totalAdhesiones ?? 1}{' '}
            {(reporte.totalAdhesiones ?? 1) === 1 ? 'vecino' : 'vecinos'}
          </p>
        </div>
        <ChipEstado estado={reporte.estado ?? ''} />
      </header>

      {carga.datos?.errorDeRecarga && (
        <p role="alert" className="rounded-control bg-error-fondo px-3 py-2 text-sm text-error-texto">
          No se pudo actualizar el reporte: {carga.datos.errorDeRecarga.mensaje} Lo que ves puede
          no estar al día.
        </p>
      )}

      {reporte.posibleReincidencia && (
        <p className="rounded-control bg-aviso-fondo px-3 py-2 text-sm text-aviso-texto">
          Un vecino comentó que este daño reapareció o quedó mal reparado (US-27).
        </p>
      )}

      {reporte.descripcion && (
        <p className="text-texto">{reporte.descripcion}</p>
      )}

      {/* Foto de reporte: pública, sirve directo en <img src>. */}
      {foto && (
        <FotoDeReporte
          src={foto}
          alt="Foto del daño reportado"
          className="max-h-72 w-full rounded-control border border-linea object-cover"
          claseDelReemplazo="h-40"
        />
      )}

      {/* QA-1 I-1: sin esto el funcionario no sabia a donde mandar la cuadrilla. */}
      <UbicacionDelReporte
        latitud={reporte.latitud}
        longitud={reporte.longitud}
        titulo={tituloVisible(reporte.titulo)}
      />

      <div className="grid gap-6 md:grid-cols-2">
        <section className="rounded-control border border-linea bg-superficie p-4">
          <CambiarEstado
            reporte={reporte}
            // Recarga todo: el cambio de estado altera el historial y puede
            // habilitar o deshabilitar la asignación de responsable.
            onCambiado={carga.recargar}
          />
        </section>

        <section className="rounded-control border border-linea bg-superficie p-4">
          <Responsable reporteId={reporteId} estado={reporte.estado ?? ''} />
        </section>
      </div>

      <section className="rounded-control border border-linea bg-superficie p-4">
        <h2 className="mb-3 text-sm font-semibold text-texto">
          Historial de gestión
        </h2>
        <LineaDeTiempo entradas={entradas} />
      </section>
    </main>
  );
}

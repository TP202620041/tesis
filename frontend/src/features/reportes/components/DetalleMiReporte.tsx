'use client';

import Link from 'next/link';
import { LineaDeTiempo } from '@/components/LineaDeTiempo';
import { FotoDeReporte } from '@/components/FotoDeReporte';
import { UbicacionDelReporte } from '@/components/UbicacionDelReporte';
import { ChipEstado } from '@/components/ui/ChipEstado';
import { textoDeSeveridad, tituloVisible } from '@/lib/types/tituloYSeveridad';
import { Aviso } from '@/components/ui/Aviso';
import { useMiReporte } from '../hooks/useMiReporte';
import {
  explicacionDeEstado,
  puedeCalificar,
  puedeEditar,
  tieneVistaPublica,
} from '../model/acciones';
import {
  AVISO_FOTO_OCULTA,
  AVISO_REPORTE_OCULTO,
  estadoDeOcultamiento,
  SIN_FOTO,
} from '../model/ocultamiento';
import { Calificar } from './Calificar';
import { Comentarios } from './Comentarios';
import { EditarReporte } from './EditarReporte';

/**
 * Seguimiento de un reporte propio: estado, historial (US-22), edicion o
 * retiro (US-08) y calificacion (US-26).
 *
 * `reporteId` es `null` si el id de la URL no es valido (QA-1 M-11): se dice
 * «Reporte no disponible» sin pedir nada al API.
 *
 * NC-11b (D-15): el creador sigue viendo su reporte aunque el ADMIN lo haya
 * ocultado (el resumen no lo dice: se deduce del historial,
 * `model/ocultamiento.ts`). Se le explica que no esta en el mapa ni en la
 * vista publica, con el motivo en el seguimiento, y no se ofrece el enlace a
 * la vista publica (daria «Reporte no disponible»). Nunca se dice quien
 * denuncio ni cuantos: el historial ya llega redactado del servidor.
 */
export function DetalleMiReporte({ reporteId }: { reporteId: number | null }) {
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
        Este reporte no existe o no lo enviaste tú. Aquí solo puedes ver los tuyos.
      </p>
      <Link href="/mis-reportes" className="self-start text-enlace hover:underline">
        Volver a mis reportes
      </Link>
    </main>
  );
}

function DetalleCargado({ reporteId }: { reporteId: number }) {
  const carga = useMiReporte(reporteId);

  // Tras editar o retirar se recarga mostrando "Cargando…", como antes de
  // FE-05: la pantalla se vuelve a montar con el reporte fresco y los
  // formularios hijos arrancan de cero.
  if (carga.estado === 'cargando' || carga.recargando) {
    return <p className="p-8 text-texto-2">Cargando…</p>;
  }

  const reporte = carga.datos?.reporte ?? null;
  if (!reporte) return <ReporteNoDisponible />;

  const entradas = carga.datos?.entradas ?? [];
  const estado = reporte.estado ?? '';
  // `api.ts` ya devuelve la URL absoluta de la foto.
  const foto = reporte.fotoUrl;
  // NC-11b: lo oculto por moderacion, deducido del historial.
  const oculto = estadoDeOcultamiento(entradas);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-6">
      <Link href="/mis-reportes" className="self-start text-sm text-enlace hover:underline">
        ← Volver a mis reportes
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
            {reporte.createdAt ? new Date(reporte.createdAt).toLocaleDateString('es-PE') : '—'}
            {(reporte.totalAdhesiones ?? 1) > 1
              ? ` · ${reporte.totalAdhesiones} vecinos lo respaldan`
              : ''}
          </p>
        </div>
        <ChipEstado estado={estado} />
      </header>

      {carga.datos?.errorDeRecarga && (
        <p role="alert" className="border border-error-borde rounded-control bg-error-fondo px-3 py-2 text-sm text-error-texto">
          No se pudo actualizar el reporte: {carga.datos.errorDeRecarga.mensaje} Lo que ves puede
          no estar al día.
        </p>
      )}

      {/* NC-11b: oculto por moderacion; el motivo esta en el seguimiento. */}
      {oculto.reporteOculto && (
        <Aviso tono="advertencia" titulo="Reporte oculto">
          <p>{AVISO_REPORTE_OCULTO}</p>
        </Aviso>
      )}
      {oculto.fotoOculta && !oculto.reporteOculto && (
        <Aviso tono="advertencia" titulo="Foto oculta">
          <p>{AVISO_FOTO_OCULTA}</p>
        </Aviso>
      )}

      {/* Explica el estado en los terminos del vecino, no del funcionario. */}
      <p className="rounded-control bg-superficie-2 px-3 py-2 text-sm text-texto">
        {explicacionDeEstado(estado)}
      </p>

      {reporte.descripcion && (
        <p className="text-texto">{reporte.descripcion}</p>
      )}

      {foto ? (
        <FotoDeReporte
          src={foto}
          alt="Foto del daño que reportaste"
          className="max-h-72 w-full rounded-control border border-linea object-cover"
          claseDelReemplazo="h-40"
        />
      ) : (
        // Sin foto, o con la foto oculta (el aviso de arriba lo explica).
        <p className="rounded-control bg-superficie-2 px-3 py-2 text-sm text-texto-2">{SIN_FOTO}</p>
      )}

      <UbicacionDelReporte
        latitud={reporte.latitud}
        longitud={reporte.longitud}
        titulo={tituloVisible(reporte.titulo)}
      />

      {puedeEditar(estado) && (
        <section className="rounded-control border border-linea bg-superficie p-4">
          <EditarReporte reporte={reporte} onActualizado={carga.recargar} />
        </section>
      )}

      {puedeCalificar(estado) && (
        <section className="rounded-control border border-linea bg-superficie p-4">
          <Calificar reporteId={reporteId} />
        </section>
      )}

      <section className="rounded-control border border-linea bg-superficie p-4">
        <h2 className="mb-3 text-sm font-semibold text-texto">
          Seguimiento
        </h2>
        <LineaDeTiempo entradas={entradas} />
      </section>

      {/* US-27: lo que opinaron los vecinos sobre la reparacion de MI
          reporte. El creador tambien puede comentar, como cualquier otro. */}
      {estado === 'RESUELTO' && (
        <section className="rounded-control border border-linea bg-superficie p-4">
          <Comentarios reporteId={reporteId} puedeComentar />
        </section>
      )}

      {/* QA-1 M-13: un reporte retirado no tiene vista publica (404); tampoco
          uno oculto por moderacion (NC-11a). */}
      {tieneVistaPublica(estado) && !oculto.reporteOculto && (
        <Link
          href={`/reportes/${reporteId}`}
          className="text-sm text-enlace hover:underline"
        >
          Ver cómo lo ven los demás (vista pública)
        </Link>
      )}
    </main>
  );
}

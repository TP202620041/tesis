'use client';

import Link from 'next/link';
import { FotoDeReporte } from '@/components/FotoDeReporte';
import { UbicacionDelReporte } from '@/components/UbicacionDelReporte';
import { ChipEstado } from '@/components/ui/ChipEstado';
import { textoDeSeveridad, tituloVisible } from '@/lib/types/tituloYSeveridad';
import { useReportePublico } from '../hooks/useReportePublico';
import { rutaDeRegresoAlMapa } from '../model/estadoDelMapa';
import { Comentarios } from './Comentarios';

/**
 * Detalle PUBLICO de un reporte (US-10 / US-27).
 *
 * `puedeComentar` lo decide la pagina con la sesion (feature `auth`):
 * comentar exige sesion de ciudadano; el funcionario gestiona, no opina.
 *
 * `volver` (QA-1 M-9) es el `?volver=` con que la lista o el popup del mapa
 * abrieron el detalle: «← Volver al mapa» regresa a esa misma vista
 * filtrada. Se valida (`rutaDeRegresoAlMapa`): solo puede llevar al mapa.
 *
 * `reporteId` es `null` si el id de la URL no es valido (QA-1 M-11): se dice
 * «Reporte no disponible» sin llamar al API, que respondia 401 a
 * `/api/reportes/NaN` y el cliente mandaba al login a quien solo abrio un
 * enlace roto.
 */
export function DetalleReportePublico({
  reporteId,
  puedeComentar,
  volver = null,
}: {
  reporteId: number | null;
  puedeComentar: boolean;
  volver?: string | null;
}) {
  const regreso = rutaDeRegresoAlMapa(volver);
  if (reporteId === null) return <ReporteNoDisponible regreso={regreso} />;
  return <DetalleCargado reporteId={reporteId} puedeComentar={puedeComentar} regreso={regreso} />;
}

function ReporteNoDisponible({ regreso }: { regreso: string }) {
  return (
    <main className="mx-auto flex w-full max-w-lg flex-col gap-4 px-4 py-10">
      <h1 className="text-xl font-semibold text-texto">
        Reporte no disponible
      </h1>
      <p className="text-texto-2">
        Este reporte no existe o fue retirado por quien lo envió.
      </p>
      <Link href={regreso} className="self-start text-enlace hover:underline">
        Ver el mapa
      </Link>
    </main>
  );
}

function DetalleCargado({
  reporteId,
  puedeComentar,
  regreso,
}: {
  reporteId: number;
  puedeComentar: boolean;
  regreso: string;
}) {
  const carga = useReportePublico(reporteId);

  if (carga.estado === 'cargando') {
    return <p className="p-8 text-texto-2">Cargando…</p>;
  }

  const reporte = carga.datos;
  if (!reporte) return <ReporteNoDisponible regreso={regreso} />;

  const estado = reporte.estado ?? '';
  // `api.ts` ya devuelve la URL absoluta de la foto.
  const foto = reporte.fotoUrl;

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-6">
      <Link href={regreso} className="text-sm text-enlace hover:underline">
        ← Volver al mapa
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
              ? ` · ${reporte.totalAdhesiones} vecinos lo reportaron`
              : ''}
          </p>
        </div>
        <ChipEstado estado={estado} />
      </header>

      {reporte.descripcion && (
        <p className="text-texto">{reporte.descripcion}</p>
      )}

      {/* La foto de un reporte es publica: sirve directo en <img src>. */}
      {foto && (
        <FotoDeReporte
          src={foto}
          alt={`Foto del daño reportado: ${tituloVisible(reporte.titulo)}`}
          className="max-h-80 w-full rounded-control border border-linea object-cover"
          claseDelReemplazo="h-40"
        />
      )}

      <UbicacionDelReporte
        latitud={reporte.latitud}
        longitud={reporte.longitud}
        titulo={tituloVisible(reporte.titulo)}
      />

      {/* US-27: solo tiene sentido opinar sobre una reparacion que ocurrio. */}
      {estado === 'RESUELTO' ? (
        <section className="rounded-control border border-linea bg-superficie p-4">
          <Comentarios reporteId={reporteId} puedeComentar={puedeComentar} />
        </section>
      ) : (
        <p className="rounded-control bg-superficie-2 px-3 py-2 text-sm text-texto-2">
          Cuando la municipalidad marque este daño como resuelto, los vecinos podrán confirmar
          aquí si la reparación funcionó.
        </p>
      )}
    </main>
  );
}

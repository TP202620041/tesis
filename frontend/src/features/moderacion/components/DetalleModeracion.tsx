'use client';

import Link from 'next/link';
import { useState } from 'react';
import { LineaDeTiempo } from '@/components/LineaDeTiempo';
import { UbicacionDelReporte } from '@/components/UbicacionDelReporte';
import { Aviso } from '@/components/ui/Aviso';
import { clasesDeBoton } from '@/components/ui/Boton';
import { ChipEstado } from '@/components/ui/ChipEstado';
import { AlertaError } from '@/components/ui/form';
import { RUTA_MODERACION_ADMIN } from '@/features/auth/model/rutas';
import type { AlcanceModeracion } from '@/lib/types/domain';
import { textoDeSeveridad, tituloVisible } from '@/lib/types/tituloYSeveridad';
import { useDetalleModeracion, type ResultadoDeAccion } from '../hooks/useDetalleModeracion';
import {
  accionesDisponibles,
  etiquetasDeVisibilidad,
  fechaDeModeracion,
  tituloDeAccion,
} from '../model/moderacion';
import type { AccionDeModeracion, ReporteEnModeracion } from '../model/tipos';
import { DesestimarDenuncias } from './DesestimarDenuncias';
import { DialogoModerar } from './DialogoModerar';
import { FotoModerada } from './FotoModerada';
import { ListaDenuncias } from './ListaDenuncias';

/**
 * NC-11b (D-15): el detalle de un reporte en el area de moderacion del
 * ADMIN: que esta oculto, la foto (aunque este oculta), las denuncias con
 * quien denuncio, la linea de tiempo completa y las acciones: ocultar o
 * restablecer el reporte o la foto (con motivo) y desestimar las denuncias.
 *
 * Funciona con cualquier reporte por su id, tenga denuncias o no: un reporte
 * oculto sin denuncias solo esta en la vista «Ocultos» de la bandeja.
 *
 * `reporteId` es `null` si el id de la URL no es valido: se dice «Reporte no
 * disponible» sin pedir nada al API.
 */
export function DetalleModeracion({ reporteId }: { reporteId: number | null }) {
  if (reporteId === null) return <ReporteNoDisponible />;
  return <DetalleCargado reporteId={reporteId} />;
}

function ReporteNoDisponible() {
  return (
    <main className="mx-auto flex w-full max-w-lg flex-col gap-4 px-4 py-10">
      <h1 className="text-xl font-semibold text-texto">Reporte no disponible</h1>
      <p className="text-texto-2">No existe un reporte con ese id.</p>
      <Link href={RUTA_MODERACION_ADMIN} className="self-start text-enlace hover:underline">
        Volver a la bandeja de moderación
      </Link>
    </main>
  );
}

type Pedido = { accion: AccionDeModeracion; alcance: AlcanceModeracion };

function DetalleCargado({ reporteId }: { reporteId: number }) {
  const carga = useDetalleModeracion(reporteId);
  const [pedido, setPedido] = useState<Pedido | null>(null);
  const [avisoDesactualizado, setAvisoDesactualizado] = useState<string | null>(null);

  if (carga.estado === 'cargando') {
    return <p className="p-8 text-texto-2">Cargando…</p>;
  }
  if (carga.estado === 'error') {
    return (
      <main className="mx-auto flex w-full max-w-lg flex-col gap-4 px-4 py-10">
        <h1 className="text-xl font-semibold text-texto">Reporte no disponible</h1>
        <AlertaError mensaje={carga.error.mensaje} detalles={carga.error.detalles} />
        <Link href={RUTA_MODERACION_ADMIN} className="self-start text-enlace hover:underline">
          Volver a la bandeja de moderación
        </Link>
      </main>
    );
  }

  const { reporte, historial } = carga.datos;
  const acciones = accionesDisponibles(reporte);
  const visibilidad = etiquetasDeVisibilidad(reporte);

  /** Lo que hace el dialogo o la desestimacion; anota el aviso si el estado estaba viejo. */
  function anotar(resultado: ResultadoDeAccion): ResultadoDeAccion {
    setAvisoDesactualizado(
      !resultado.ok && resultado.campo === null && resultado.desactualizado ? resultado.mensaje : null,
    );
    return resultado;
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6">
      <Link href={RUTA_MODERACION_ADMIN} className="self-start text-sm text-enlace hover:underline">
        ← Volver a la bandeja de moderación
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-texto">{tituloVisible(reporte.titulo)}</h1>
          <p className="text-sm font-medium text-texto">
            {[reporte.categoriaNombre, textoDeSeveridad(reporte.severidad)].filter(Boolean).join(' · ')}
          </p>
          <p className="text-sm text-texto-2">
            Reporte #{reporte.id} · {reporte.distritoNombre ?? 'Sin distrito'} ·{' '}
            {fechaDeModeracion(reporte.createdAt)}
          </p>
        </div>
        <ChipEstado estado={reporte.estado} />
      </header>

      {carga.recargando && (
        <p role="status" className="text-sm text-texto-2">
          Actualizando…
        </p>
      )}
      {avisoDesactualizado && (
        <Aviso tono="advertencia" rol="alert" titulo="El reporte cambió">
          <p>{avisoDesactualizado} Se volvió a cargar lo que hay ahora.</p>
        </Aviso>
      )}

      {/* Que ve el publico hoy. */}
      <section aria-labelledby="visibilidad" className="flex flex-col gap-2">
        <h2 id="visibilidad" className="text-sm font-semibold text-texto">
          Visibilidad
        </h2>
        {visibilidad.length === 0 ? (
          <p className="text-sm text-texto">Visible para todos: nada está oculto.</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {visibilidad.map((etiqueta) => (
              <li
                key={etiqueta}
                className="rounded-full border border-aviso-borde bg-aviso-fondo px-2.5 py-0.5 text-sm font-semibold text-aviso-texto"
              >
                {etiqueta}
              </li>
            ))}
          </ul>
        )}
        {reporte.oculto && (
          <p className="text-sm text-texto-2">
            Mientras esté oculto no cuenta en el índice de desempeño del distrito. Su creador sigue
            viéndolo en «Mis reportes».
          </p>
        )}
      </section>

      {reporte.descripcion && <p className="text-texto">{reporte.descripcion}</p>}

      <FotoModerada
        reporteId={reporte.id}
        tieneFoto={reporte.tieneFoto}
        fotoOculta={reporte.fotoOculta}
        titulo={tituloVisible(reporte.titulo)}
      />

      <UbicacionDelReporte
        latitud={reporte.latitud}
        longitud={reporte.longitud}
        titulo={tituloVisible(reporte.titulo)}
      />

      <Acciones reporte={reporte} acciones={acciones} onPedir={setPedido} ocupado={carga.operacion !== null} />

      {acciones.desestimar && (
        <section className="rounded-control border border-linea bg-superficie p-4">
          <DesestimarDenuncias
            enviando={carga.operacion === 'desestimar'}
            onDesestimar={async (motivo) => anotar(await carga.desestimar(motivo))}
          />
        </section>
      )}

      <section aria-labelledby="denuncias" className="flex flex-col gap-3">
        <h2 id="denuncias" className="text-sm font-semibold text-texto">
          Denuncias ({reporte.denuncias.length})
        </h2>
        <ListaDenuncias denuncias={reporte.denuncias} />
      </section>

      <section className="rounded-control border border-linea bg-superficie p-4">
        <h2 className="mb-3 text-sm font-semibold text-texto">Seguimiento</h2>
        <LineaDeTiempo entradas={historial} />
      </section>

      {pedido && (
        <DialogoModerar
          accion={pedido.accion}
          alcance={pedido.alcance}
          abierto
          alCerrar={() => setPedido(null)}
          onConfirmar={async (orden) =>
            anotar(await (pedido.accion === 'ocultar' ? carga.ocultar(orden) : carga.restablecer(orden)))
          }
        />
      )}
    </main>
  );
}

function Acciones({
  reporte,
  acciones,
  onPedir,
  ocupado,
}: {
  reporte: ReporteEnModeracion;
  acciones: ReturnType<typeof accionesDisponibles>;
  onPedir: (pedido: Pedido) => void;
  ocupado: boolean;
}) {
  const botones: { pedido: Pedido; disponible: boolean }[] = [
    { pedido: { accion: 'ocultar', alcance: 'REPORTE' }, disponible: acciones.ocultarReporte },
    { pedido: { accion: 'restablecer', alcance: 'REPORTE' }, disponible: acciones.restablecerReporte },
    { pedido: { accion: 'ocultar', alcance: 'FOTO' }, disponible: acciones.ocultarFoto },
    { pedido: { accion: 'restablecer', alcance: 'FOTO' }, disponible: acciones.restablecerFoto },
  ];
  return (
    <section aria-labelledby="acciones" className="flex flex-col gap-3">
      <h2 id="acciones" className="text-sm font-semibold text-texto">
        Acciones
      </h2>
      <div className="flex flex-wrap gap-3">
        {botones
          .filter((b) => b.disponible)
          .map(({ pedido }) => (
            <button
              key={`${pedido.accion}-${pedido.alcance}`}
              type="button"
              aria-haspopup="dialog"
              disabled={ocupado}
              onClick={() => onPedir(pedido)}
              className={clasesDeBoton(pedido.accion === 'ocultar' ? 'peligro' : 'secundario')}
            >
              {tituloDeAccion(pedido.accion, pedido.alcance)}
            </button>
          ))}
      </div>
      {!reporte.tieneFoto && <p className="text-xs text-texto-2">Sin foto que ocultar.</p>}
    </section>
  );
}

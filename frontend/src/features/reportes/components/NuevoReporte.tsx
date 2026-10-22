'use client';

import Link from 'next/link';
import { useState } from 'react';
import { FotoDeReporte } from '@/components/FotoDeReporte';
import { etiquetaDeSeveridad, tituloVisible } from '@/lib/types/tituloYSeveridad';
import { RUTA_REPORTES_QUE_APOYAS } from '../model/apoyos';
import type { ReporteCreado } from '../model/tipos';
import { FormularioReporte } from './FormularioReporte';
import { clasesDeBoton } from '@/components/ui/Boton';

/**
 * US-05: formulario de reporte y, tras el 201, su confirmacion. "Reportar
 * otro daño" vuelve al formulario, que se monta de nuevo (y con el, una
 * `Idempotency-Key` nueva: es otro reporte).
 */
export function NuevoReporte({ usuarioId }: { usuarioId: number }) {
  const [creado, setCreado] = useState<ReporteCreado | null>(null);
  const [encolado, setEncolado] = useState(false);

  if (creado) return <Confirmacion reporte={creado} onOtro={() => setCreado(null)} />;
  if (encolado) return <ConfirmacionSinConexion onOtro={() => setEncolado(false)} />;

  return (
    <>
      <header>
        <h1 className="text-2xl font-bold text-texto">
          Reportar un daño vial
        </h1>
        <p className="mt-1 text-sm text-texto-2">
          Tu reporte llega automáticamente a la municipalidad del distrito donde ocurre. No
          tienes que saber cuál es.
        </p>
      </header>
      <FormularioReporte
        usuarioId={usuarioId}
        onCreado={setCreado}
        onEncolado={() => setEncolado(true)}
      />
    </>
  );
}

/**
 * US-06: el reporte quedo guardado en el dispositivo. Se dice sin rodeos que
 * TODAVIA no llego a la municipalidad: no hay distrito ni numero que mostrar
 * hasta que el backend lo reciba.
 */
function ConfirmacionSinConexion({ onOtro }: { onOtro: () => void }) {
  return (
    <section
      className="flex flex-col gap-4 rounded-tarjeta border border-aviso-borde bg-aviso-fondo p-6"
      aria-live="polite"
    >
      <h1 className="text-xl font-semibold text-aviso-texto">
        Pendiente de envío
      </h1>
      <p className="text-aviso-texto">
        No hay conexión, así que tu reporte quedó <strong>guardado en este dispositivo</strong>.
        Se enviará solo cuando vuelva la señal, sin que tengas que hacer nada. Si para entonces tu
        sesión venció, se enviará cuando vuelvas a iniciarla.
      </p>
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={onOtro}
          className={clasesDeBoton('primario')}
        >
          Reportar otro daño
        </button>
        <Link
          href="/mis-reportes"
          className={clasesDeBoton('secundario')}
        >
          Ver mis reportes
        </Link>
      </div>
    </section>
  );
}

/**
 * Confirmacion tras el 201.
 *
 * Distingue explicitamente los dos desenlaces de US-09: un reporte NUEVO y
 * una ADHESION a uno existente cercano. Mostrar el mismo mensaje en ambos
 * casos seria enganoso — en el segundo el ciudadano no creo nada, se sumo a
 * un reporte que ya existia, y eso cambia lo que puede esperar despues.
 *
 * NC-02: titulo y severidad son los de la RESPUESTA, no los que escribio el
 * ciudadano: en una adhesion el backend descarta los enviados y devuelve los
 * del reporte existente. Mostrar los escritos presentaria como propio un
 * titulo que no quedo registrado.
 *
 * QA-1 M-6: tras una adhesion, el enlace lleva a «Reportes que apoyas» (el
 * reporte no aparece entre los propios: no lo creo el ciudadano).
 */
function Confirmacion({ reporte, onOtro }: { reporte: ReporteCreado; onOtro: () => void }) {
  // `api.ts` ya devuelve la URL absoluta de la foto.
  const foto = reporte.fotoUrl;

  return (
    <section
      className="flex flex-col gap-4 rounded-tarjeta border border-linea bg-superficie p-6"
      aria-live="polite"
    >
      {reporte.esAdhesion ? (
        <>
          <h1 className="text-xl font-semibold text-texto">
            Ya existía un reporte de este daño
          </h1>
          <p className="text-texto">
            Alguien más ya había reportado este mismo daño muy cerca, así que{' '}
            <strong>te sumaste a ese reporte</strong>
            {reporte.titulo ? <> («{reporte.titulo}»)</> : null} en lugar de crear uno duplicado.
            Se conservan su título y su severidad; los que escribiste no se usaron. Ahora hay{' '}
            <strong>{reporte.totalAdhesiones} vecinos</strong> respaldándolo, lo que ayuda a que la
            municipalidad lo priorice.
          </p>
        </>
      ) : (
        <>
          <h1 className="text-xl font-semibold text-exito-texto">
            Reporte enviado
          </h1>
          <p className="text-texto">
            Tu reporte fue registrado y ya está en la bandeja de la municipalidad
            {reporte.distritoNombre ? ` de ${reporte.distritoNombre}` : ''}. Te avisaremos cuando
            cambie de estado.
          </p>
        </>
      )}

      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        <dt className="font-medium text-texto-2">Título</dt>
        <dd className="text-texto">{tituloVisible(reporte.titulo)}</dd>
        <dt className="font-medium text-texto-2">Severidad</dt>
        <dd className="text-texto">
          {etiquetaDeSeveridad(reporte.severidad) ?? '—'}
        </dd>
        <dt className="font-medium text-texto-2">Tipo</dt>
        <dd className="text-texto">{reporte.categoriaNombre ?? '—'}</dd>
        <dt className="font-medium text-texto-2">Distrito</dt>
        <dd className="text-texto">{reporte.distritoNombre ?? '—'}</dd>
      </dl>

      {/* La foto del reporte es publica: sirve directo en <img src>. */}
      {foto && (
        <FotoDeReporte
          src={foto}
          alt="Foto del daño reportado"
          className="max-h-56 w-full rounded-control border border-linea object-cover"
          claseDelReemplazo="h-32"
        />
      )}

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={onOtro}
          className={clasesDeBoton('primario')}
        >
          Reportar otro daño
        </button>
        {reporte.esAdhesion ? (
          <Link href={RUTA_REPORTES_QUE_APOYAS} className={clasesDeBoton('secundario')}>
            Ver los reportes que apoyas
          </Link>
        ) : (
          <Link href="/mis-reportes" className={clasesDeBoton('secundario')}>
            Ver mis reportes
          </Link>
        )}
      </div>
    </section>
  );
}

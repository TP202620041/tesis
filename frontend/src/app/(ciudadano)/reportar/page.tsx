'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { FormularioReporte } from '@/features/reportes/components/FormularioReporte';
import type { ReporteCreado } from '@/features/reportes/model/tipos';
import { useSesion } from '@/features/auth/hooks';
import { BotonCerrarSesion } from '@/features/auth/components/BotonCerrarSesion';
import { urlDeFoto } from '@/lib/api/client';

/** US-05: crear un reporte de daño vial. */
export default function ReportarPage() {
  const router = useRouter();
  const sesion = useSesion();
  const [creado, setCreado] = useState<ReporteCreado | null>(null);

  useEffect(() => {
    if (sesion.estado === 'anonimo') router.replace('/login?redirect=/reportar');
  }, [sesion.estado, router]);

  if (sesion.estado === 'cargando') {
    return <p className="p-8 text-slate-600 dark:text-slate-400">Cargando…</p>;
  }
  if (sesion.estado === 'anonimo') return null;

  return (
    <main className="mx-auto flex w-full max-w-lg flex-col gap-6 px-4 py-8">
      <BotonCerrarSesion className="self-end" />
      {creado ? (
        <Confirmacion reporte={creado} onOtro={() => setCreado(null)} />
      ) : (
        <>
          <header>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
              Reportar un daño vial
            </h1>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              Tu reporte llega automáticamente a la municipalidad del distrito donde ocurre. No
              tienes que saber cuál es.
            </p>
          </header>
          <FormularioReporte onCreado={setCreado} />
        </>
      )}
    </main>
  );
}

/**
 * Confirmacion tras el 201.
 *
 * Distingue explicitamente los dos desenlaces de US-09: un reporte NUEVO y
 * una ADHESION a uno existente cercano. Mostrar el mismo mensaje en ambos
 * casos seria enganoso — en el segundo el ciudadano no creo nada, se sumo a
 * un reporte que ya existia, y eso cambia lo que puede esperar despues.
 */
function Confirmacion({ reporte, onOtro }: { reporte: ReporteCreado; onOtro: () => void }) {
  const foto = urlDeFoto(reporte.fotoUrl);

  return (
    <section
      className="flex flex-col gap-4 rounded-lg border border-slate-200 bg-white p-6
                 dark:border-slate-700 dark:bg-slate-800"
      aria-live="polite"
    >
      {reporte.esAdhesion ? (
        <>
          <h1 className="text-xl font-semibold text-sky-800 dark:text-sky-300">
            Ya existía un reporte de este daño
          </h1>
          <p className="text-slate-700 dark:text-slate-300">
            Alguien más ya había reportado este mismo daño muy cerca, así que{' '}
            <strong>te sumaste a ese reporte</strong> en lugar de crear uno duplicado. Ahora hay{' '}
            <strong>{reporte.totalAdhesiones} vecinos</strong> respaldándolo, lo que ayuda a que la
            municipalidad lo priorice.
          </p>
        </>
      ) : (
        <>
          <h1 className="text-xl font-semibold text-emerald-800 dark:text-emerald-300">
            Reporte enviado
          </h1>
          <p className="text-slate-700 dark:text-slate-300">
            Tu reporte fue registrado y ya está en la bandeja de la municipalidad
            {reporte.distritoNombre ? ` de ${reporte.distritoNombre}` : ''}. Te avisaremos cuando
            cambie de estado.
          </p>
        </>
      )}

      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        <dt className="font-medium text-slate-500 dark:text-slate-400">Tipo</dt>
        <dd className="text-slate-900 dark:text-slate-100">{reporte.categoriaNombre ?? '—'}</dd>
        <dt className="font-medium text-slate-500 dark:text-slate-400">Distrito</dt>
        <dd className="text-slate-900 dark:text-slate-100">{reporte.distritoNombre ?? '—'}</dd>
      </dl>

      {/* La foto del reporte es publica: sirve directo en <img src>. */}
      {foto && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={foto}
          alt="Foto del daño reportado"
          className="max-h-56 w-full rounded-md border border-slate-200 object-cover dark:border-slate-700"
        />
      )}

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={onOtro}
          className="rounded-md bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700"
        >
          Reportar otro daño
        </button>
        <Link
          href="/mis-reportes"
          className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium
                     text-slate-700 dark:border-slate-600 dark:text-slate-200"
        >
          Ver mis reportes
        </Link>
      </div>
    </section>
  );
}

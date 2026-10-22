'use client';

import Link from 'next/link';
import { FotoDeReporte } from '@/components/FotoDeReporte';
import { estiloDeEstado } from '@/lib/types/estados';
import { textoDeSeveridad, tituloVisible } from '@/lib/types/tituloYSeveridad';
import { useReportesEnCola } from '../hooks/useColaOffline';
import { useMisReportes } from '../hooks/useMisReportes';
import { PendientesDeEnvio } from './PendientesDeEnvio';

/**
 * US-07: los reportes que el ciudadano envio, con su estado actual.
 *
 * La navegacion (perfil, mapa, reportar, soporte) y «Cerrar sesión» son del
 * marco comun de la app (DIS-1), no de esta pantalla.
 */
export function ListaMisReportes({ usuarioId }: { usuarioId: number }) {
  const carga = useMisReportes();
  const cola = useReportesEnCola(usuarioId);
  const cargando = carga.estado === 'cargando';
  const error = carga.estado === 'error' ? 'No se pudieron cargar tus reportes.' : null;
  const reportes = carga.datos?.reportes ?? [];
  const porCalificar = carga.datos?.porCalificar ?? [];

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6">
      <header>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Mis reportes</h1>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Los daños que enviaste y en qué va cada uno.
        </p>
      </header>

      {error && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950 dark:text-red-200">
          {error}
        </p>
      )}

      {/* Aviso no intrusivo: US-26 Escenario 2. */}
      {porCalificar.length > 0 && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100">
          Tienes {porCalificar.length}{' '}
          {porCalificar.length === 1 ? 'reporte resuelto' : 'reportes resueltos'} sin calificar. Tu
          opinión alimenta el índice público de desempeño de tu municipalidad.
        </p>
      )}

      <PendientesDeEnvio
        pendientes={cola.pendientes}
        onDescartar={(clave) => void cola.descartar(clave)}
        onReenviarConClaveNueva={(r) => void cola.reenviarConClaveNueva(r)}
        onCompletar={cola.completar}
      />

      {cargando && <p className="text-slate-600 dark:text-slate-400">Cargando…</p>}

      {!cargando && reportes.length === 0 && cola.pendientes.length === 0 && !error && (
        <div className="flex flex-col items-start gap-3 rounded-md border border-dashed border-slate-300 p-8 dark:border-slate-600">
          <p className="text-slate-600 dark:text-slate-400">
            Todavía no has enviado ningún reporte.
          </p>
          <Link
            href="/reportar"
            className="rounded-md bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700"
          >
            Reportar mi primer daño
          </Link>
        </div>
      )}

      {!cargando && reportes.length > 0 && (
        <ul className="flex flex-col gap-2">
          {reportes.map((reporte) => {
            const estilo = estiloDeEstado(reporte.estado ?? '');
            const severidad = textoDeSeveridad(reporte.severidad);
            // `api.ts` ya devuelve la URL absoluta de la foto.
            const foto = reporte.fotoUrl;
            return (
              <li key={reporte.id}>
                <Link
                  href={`/mis-reportes/${reporte.id}`}
                  className="flex items-start gap-3 rounded-md border border-slate-200 bg-white p-3
                             transition hover:border-sky-400 dark:border-slate-700 dark:bg-slate-800"
                >
                  {foto ? (
                    // Foto de reporte: pública, sirve directo en <img src>.
                    // Decorativa: el título de la fila ya nombra el reporte.
                    <FotoDeReporte
                      src={foto}
                      alt=""
                      className="size-14 shrink-0 rounded object-cover"
                    />
                  ) : (
                    <span
                      aria-hidden="true"
                      className="size-14 shrink-0 rounded bg-slate-100 dark:bg-slate-700"
                    />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <strong className="text-slate-900 dark:text-slate-100">
                        {tituloVisible(reporte.titulo)}
                      </strong>
                      <span
                        className="rounded-full px-2 py-0.5 text-xs font-medium text-white"
                        style={{ background: estilo.color }}
                      >
                        {estilo.etiqueta}
                      </span>
                    </span>
                    <span className="mt-0.5 block text-sm text-slate-600 dark:text-slate-400">
                      {reporte.categoriaNombre}
                      {severidad ? ` · ${severidad}` : ''}
                    </span>
                    <span className="mt-0.5 block text-sm text-slate-600 dark:text-slate-400">
                      {reporte.distritoNombre}
                      {reporte.createdAt
                        ? ` · ${new Date(reporte.createdAt).toLocaleDateString('es-PE')}`
                        : ''}
                      {(reporte.totalAdhesiones ?? 1) > 1
                        ? ` · ${reporte.totalAdhesiones} vecinos`
                        : ''}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}

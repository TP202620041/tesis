'use client';

import Link from 'next/link';
import { use, useEffect, useState } from 'react';
import { useSesion } from '@/features/auth/hooks';
import { reportePorId, type ReporteResumen } from '@/features/reportes/api';
import { Comentarios } from '@/features/reportes/components/Comentarios';
import { estiloDeEstado } from '@/lib/types/estados';
import { urlDeFoto } from '@/lib/api/client';

/**
 * Detalle PUBLICO de un reporte (US-10 / US-27).
 *
 * Accesible sin sesion: cualquiera puede abrir el enlace de un reporte, ver
 * la foto, el estado y lo que opinaron los vecinos sobre la reparacion. Solo
 * escribir un comentario exige haber iniciado sesion.
 *
 * Es tambien lo que hace enlazable un reporte concreto — antes no habia
 * forma de compartir uno.
 */
export default function ReportePublicoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const reporteId = Number(id);

  const sesion = useSesion();
  const [reporte, setReporte] = useState<ReporteResumen | null>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    let cancelado = false;
    const cargar = async () => {
      setCargando(true);
      try {
        const encontrado = await reportePorId(reporteId);
        if (!cancelado) setReporte(encontrado);
      } catch {
        if (!cancelado) setReporte(null);
      } finally {
        if (!cancelado) setCargando(false);
      }
    };
    void cargar();
    return () => {
      cancelado = true;
    };
  }, [reporteId]);

  if (cargando) {
    return <p className="p-8 text-slate-600 dark:text-slate-400">Cargando…</p>;
  }

  if (!reporte) {
    return (
      <main className="mx-auto flex w-full max-w-lg flex-col gap-4 px-4 py-10">
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
          Reporte no disponible
        </h1>
        <p className="text-slate-600 dark:text-slate-400">
          Este reporte no existe o fue retirado por quien lo envió.
        </p>
        <Link href="/mapa" className="self-start text-sky-700 hover:underline dark:text-sky-400">
          Ver el mapa
        </Link>
      </main>
    );
  }

  const estado = reporte.estado ?? '';
  const estilo = estiloDeEstado(estado);
  const foto = urlDeFoto(reporte.fotoUrl);
  // Comentar exige sesion de ciudadano; el funcionario gestiona, no opina.
  const puedeComentar = sesion.estado === 'autenticado' && sesion.usuario.rol === 'CIUDADANO';

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-6">
      <Link href="/mapa" className="text-sm text-sky-700 hover:underline dark:text-sky-400">
        ← Volver al mapa
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
            {reporte.categoriaNombre}
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            {reporte.distritoNombre} ·{' '}
            {reporte.createdAt ? new Date(reporte.createdAt).toLocaleDateString('es-PE') : '—'}
            {(reporte.totalAdhesiones ?? 1) > 1
              ? ` · ${reporte.totalAdhesiones} vecinos lo reportaron`
              : ''}
          </p>
        </div>
        <span
          className="rounded-full px-3 py-1 text-sm font-medium text-white"
          style={{ background: estilo.color }}
        >
          {estilo.etiqueta}
        </span>
      </header>

      {reporte.descripcion && (
        <p className="text-slate-700 dark:text-slate-300">{reporte.descripcion}</p>
      )}

      {foto && (
        // La foto de un reporte es publica: sirve directo en <img src>.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={foto}
          alt={`Foto del daño reportado: ${reporte.categoriaNombre ?? ''}`}
          className="max-h-80 w-full rounded-md border border-slate-200 object-cover dark:border-slate-700"
        />
      )}

      {/* US-27: solo tiene sentido opinar sobre una reparacion que ocurrio. */}
      {estado === 'RESUELTO' ? (
        <section className="rounded-md border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
          <Comentarios reporteId={reporteId} puedeComentar={puedeComentar} />
        </section>
      ) : (
        <p className="rounded-md bg-slate-100 px-3 py-2 text-sm text-slate-600 dark:bg-slate-800 dark:text-slate-400">
          Cuando la municipalidad marque este daño como resuelto, los vecinos podrán confirmar
          aquí si la reparación funcionó.
        </p>
      )}
    </main>
  );
}

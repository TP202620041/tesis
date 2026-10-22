'use client';

import { use } from 'react';
import { useSesion } from '@/features/auth/hooks/useSesion';
import { puedeComentarReportes } from '@/features/auth/model/permisos';
import { DetalleReportePublico } from '@/features/reportes/components/DetalleReportePublico';

/**
 * Detalle PUBLICO de un reporte (US-10 / US-27).
 *
 * Accesible sin sesion: cualquiera puede abrir el enlace de un reporte, ver
 * la foto, el estado y lo que opinaron los vecinos sobre la reparacion. Solo
 * escribir un comentario exige haber iniciado sesion.
 *
 * Es tambien lo que hace enlazable un reporte concreto — antes no habia
 * forma de compartir uno.
 *
 * `?volver=` (QA-1 M-9) lo agregan la lista y el popup de `/mapa`: es la
 * vista filtrada a la que regresa «← Volver al mapa». Se lee de las props
 * de la pagina (no con `useSearchParams`, que pediria un limite de Suspense)
 * y lo valida el componente.
 */
export default function ReportePublicoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = use(params);
  const { volver } = use(searchParams);
  const sesion = useSesion();
  const puedeComentar = puedeComentarReportes(
    sesion.estado === 'autenticado' ? sesion.usuario : null,
  );

  return (
    <DetalleReportePublico
      reporteId={Number(id)}
      puedeComentar={puedeComentar}
      volver={typeof volver === 'string' ? volver : null}
    />
  );
}

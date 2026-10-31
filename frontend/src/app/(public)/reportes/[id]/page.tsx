'use client';

import { use } from 'react';
import { useSesion } from '@/features/auth/hooks/useSesion';
import { puedeComentarReportes, puedeDenunciarReportes } from '@/features/auth/model/permisos';
import { DetalleReportePublico } from '@/features/reportes/components/DetalleReportePublico';
import { idDeRuta } from '@/lib/types/idDeRuta';

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
 *
 * El id se valida antes de llamar al API (QA-1 M-11): `/reportes/abc` dice
 * «Reporte no disponible» en vez de mandar al login.
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
  const usuario = sesion.estado === 'autenticado' ? sesion.usuario : null;

  return (
    <DetalleReportePublico
      reporteId={idDeRuta(id)}
      puedeComentar={puedeComentarReportes(usuario)}
      // NC-11b: denunciar exige sesion de ciudadano; sin sesion, enlace al login.
      puedeDenunciar={puedeDenunciarReportes(usuario)}
      sinSesion={sesion.estado === 'anonimo'}
      volver={typeof volver === 'string' ? volver : null}
    />
  );
}

'use client';

import { use } from 'react';
import { useSesion } from '@/features/auth/hooks/useSesion';
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
 */
export default function ReportePublicoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const sesion = useSesion();
  // Comentar exige sesion de ciudadano; el funcionario gestiona, no opina.
  const puedeComentar = sesion.estado === 'autenticado' && sesion.usuario.rol === 'CIUDADANO';

  return <DetalleReportePublico reporteId={Number(id)} puedeComentar={puedeComentar} />;
}

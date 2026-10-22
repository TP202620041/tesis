'use client';

import { use } from 'react';
import { BotonCerrarSesion } from '@/features/auth/components/BotonCerrarSesion';
import { GuardiaDeRol } from '@/features/auth/components/GuardiaDeRol';
import { DetalleMiReporte } from '@/features/reportes/components/DetalleMiReporte';
import { idDeRuta } from '@/lib/types/idDeRuta';

/**
 * Seguimiento de un reporte propio: estado, historial (US-22), edicion o
 * retiro (US-08) y calificacion (US-26).
 *
 * `params` se tipa a mano por el mismo motivo que en la bandeja municipal:
 * `PageProps<'/...'>` lo genera Next en el build y `tsc --noEmit` sobre un
 * checkout limpio no lo encontraria.
 */
export default function MiReportePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <GuardiaDeRol rolesPermitidos={['CIUDADANO']}>
      {() => <DetalleMiReporte reporteId={idDeRuta(id)} cierreDeSesion={<BotonCerrarSesion />} />}
    </GuardiaDeRol>
  );
}

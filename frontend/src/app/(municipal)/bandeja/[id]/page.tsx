'use client';

import { use } from 'react';
import { GuardiaDeRol } from '@/features/auth/components/GuardiaDeRol';
import { ROLES_AREA_MUNICIPAL } from '@/features/auth/model/rutas';
import { DetalleGestionReporte } from '@/features/gestion/components/DetalleGestionReporte';
import { idDeRuta } from '@/lib/types/idDeRuta';

/**
 * US-14/US-15/US-22: detalle de gestión de un reporte.
 *
 * `params` se tipa a mano en vez de usar `PageProps<'/bandeja/[id]'>`: ese
 * tipo lo genera Next durante el build, así que `tsc --noEmit` sobre un
 * checkout limpio (sin `.next/`) fallaría al no encontrar la ruta. El tipo
 * explícito no depende de artefactos generados.
 */
export default function DetalleReportePage({ params }: { params: Promise<{ id: string }> }) {
  // En Next 16 los params llegan como promesa.
  const { id } = use(params);
  // QA-1 M-11: un id que no es entero positivo no llega al API.
  const reporteId = idDeRuta(id);

  return (
    <GuardiaDeRol rolesPermitidos={ROLES_AREA_MUNICIPAL}>
      {() => <DetalleGestionReporte reporteId={reporteId} />}
    </GuardiaDeRol>
  );
}

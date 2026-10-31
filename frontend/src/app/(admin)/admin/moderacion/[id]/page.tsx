'use client';

import { use } from 'react';
import { GuardiaDeRol } from '@/features/auth/components/GuardiaDeRol';
import { ROLES_AREA_ADMIN } from '@/features/auth/model/rutas';
import { DetalleModeracion } from '@/features/moderacion/components/DetalleModeracion';
import { idDeRuta } from '@/lib/types/idDeRuta';

/**
 * NC-11b (D-15): detalle de un reporte en moderacion, con sus denuncias y
 * las acciones del ADMIN. Funciona con cualquier reporte por su id.
 *
 * `params` se tipa a mano por el mismo motivo que en la bandeja municipal:
 * `PageProps<'/...'>` lo genera Next en el build y `tsc --noEmit` sobre un
 * checkout limpio no lo encontraria.
 */
export default function ReporteEnModeracionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <GuardiaDeRol rolesPermitidos={ROLES_AREA_ADMIN}>
      {() => <DetalleModeracion reporteId={idDeRuta(id)} />}
    </GuardiaDeRol>
  );
}

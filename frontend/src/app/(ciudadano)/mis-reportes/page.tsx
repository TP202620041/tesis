'use client';

import { BotonCerrarSesion } from '@/features/auth/components/BotonCerrarSesion';
import { GuardiaDeRol } from '@/features/auth/components/GuardiaDeRol';
import { ListaMisReportes } from '@/features/reportes/components/ListaMisReportes';

/** US-07: los reportes que el ciudadano envio, con su estado actual. */
export default function MisReportesPage() {
  return (
    <GuardiaDeRol rolesPermitidos={['CIUDADANO']}>
      {() => <ListaMisReportes cierreDeSesion={<BotonCerrarSesion />} />}
    </GuardiaDeRol>
  );
}

'use client';

import { GuardiaDeRol } from '@/features/auth/components/GuardiaDeRol';
import { ROLES_AREA_MUNICIPAL } from '@/features/auth/model/rutas';
import { BandejaMunicipal } from '@/features/gestion/components/BandejaMunicipal';

/** US-13: bandeja de reportes del distrito del funcionario. */
export default function BandejaPage() {
  return (
    <GuardiaDeRol rolesPermitidos={ROLES_AREA_MUNICIPAL}>
      {(usuario) => <BandejaMunicipal usuario={usuario} />}
    </GuardiaDeRol>
  );
}

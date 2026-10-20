'use client';

import { EditarPerfil } from '@/features/auth/components/EditarPerfil';
import { GuardiaDeRol } from '@/features/auth/components/GuardiaDeRol';

/** US-30: el ciudadano edita sus datos, su foto y como quiere recibir avisos. */
export default function PerfilPage() {
  return (
    <GuardiaDeRol rolesPermitidos={['CIUDADANO']}>{(u) => <EditarPerfil inicial={u} />}</GuardiaDeRol>
  );
}

'use client';

import { EditarPerfil } from '@/features/auth/components/EditarPerfil';
import { GuardiaDeRol } from '@/features/auth/components/GuardiaDeRol';
import { MiCuenta } from '@/features/auth/components/MiCuenta';
import { TextoTerminosYPrivacidad } from '@/features/legal/components/TextoTerminosYPrivacidad';

/**
 * La pantalla de la cuenta («Cuenta» en la barra del móvil), para cualquier
 * rol. US-30: el ciudadano edita sus datos, su foto y cómo quiere recibir
 * avisos. El funcionario y el ADMIN no tienen perfil editable: ven quiénes
 * son, la apariencia y sus enlaces. Todos terminan en «Cerrar sesión».
 */
export default function PerfilPage() {
  return (
    <GuardiaDeRol rolesPermitidos={['CIUDADANO', 'FUNCIONARIO_MUNICIPAL', 'ADMIN']}>
      {(u) =>
        u.rol === 'CIUDADANO' ? (
          <EditarPerfil inicial={u} textoLegal={<TextoTerminosYPrivacidad conTitulo={false} />} />
        ) : (
          <MiCuenta usuario={u} />
        )
      }
    </GuardiaDeRol>
  );
}

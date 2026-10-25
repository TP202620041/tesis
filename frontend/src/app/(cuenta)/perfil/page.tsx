'use client';

import { PantallaDeCuenta } from '@/features/auth/components/PantallaDeCuenta';
import { TextoTerminosYPrivacidad } from '@/features/legal/components/TextoTerminosYPrivacidad';

/**
 * La pantalla de la cuenta («Cuenta» en la barra del móvil), para cualquier
 * rol: el ciudadano edita su perfil (US-30); el funcionario y el ADMIN ven
 * quiénes son, la apariencia y sus enlaces. Todos terminan en «Cerrar sesión»,
 * también sin red.
 */
export default function PerfilPage() {
  return <PantallaDeCuenta textoLegal={<TextoTerminosYPrivacidad conTitulo={false} />} />;
}

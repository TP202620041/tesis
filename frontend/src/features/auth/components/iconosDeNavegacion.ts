import {
  ChartColumn,
  ClipboardList,
  Inbox,
  LayoutDashboard,
  LifeBuoy,
  LogIn,
  Map as IconoMapa,
  Plus,
  Tags,
  UserRound,
  UserRoundPlus,
  type LucideIcon,
} from 'lucide-react';
import type { IconoNavegacion } from '../model/navegacion';

/** Icono de Lucide de cada ítem de la navegación (`model/navegacion.ts`). */
export const ICONOS_DE_NAVEGACION: Record<IconoNavegacion, LucideIcon> = {
  mapa: IconoMapa,
  'mis-reportes': ClipboardList,
  reportar: Plus,
  desempeno: ChartColumn,
  bandeja: Inbox,
  panel: LayoutDashboard,
  categorias: Tags,
  soporte: LifeBuoy,
  perfil: UserRound,
  entrar: LogIn,
  registrarse: UserRoundPlus,
};

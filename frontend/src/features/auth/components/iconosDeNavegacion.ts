import {
  ChartColumn,
  CircleUser,
  ClipboardList,
  Inbox,
  LayoutDashboard,
  LifeBuoy,
  LogIn,
  Map as IconoMapa,
  Plus,
  ShieldAlert,
  Tags,
  UserRound,
  UserRoundPlus,
  type LucideIcon,
} from 'lucide-react';
import type { IconoNavegacion } from '../model/navegacion';

/**
 * Texto de los ítems de la barra inferior (incluida «Cuenta»). Con cinco
 * columnas, a 320 px cada una mide 64 px y «Mis reportes» en 12 px no cabe en
 * una línea: por debajo de 360 px baja a 11 px y puede partirse en dos
 * («Mis / reportes»), que caben en los 64 px de alto de la barra. Desde 360 px,
 * 12 px y una sola línea.
 */
export const ETIQUETA_INFERIOR = 'text-[0.6875rem] break-words min-[360px]:text-xs min-[360px]:whitespace-nowrap';

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
  moderacion: ShieldAlert,
  perfil: UserRound,
  cuenta: CircleUser,
  entrar: LogIn,
  registrarse: UserRoundPlus,
};

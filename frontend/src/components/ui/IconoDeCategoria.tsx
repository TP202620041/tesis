import {
  Activity,
  Bike,
  Bridge,
  CircleDot,
  Construction,
  Droplets,
  Ellipsis,
  Fence,
  Footprints,
  Lightbulb,
  Shovel,
  Signpost,
  Tag,
  TrafficCone,
  TreeDeciduous,
  type LucideIcon,
} from 'lucide-react';
import { iconoDeCategoria, type IconoCategoria } from '@/lib/types/iconoCategoria';
import { Icono } from './Icono';

/**
 * US-29 / US-34: pictograma de cada valor de `IconoCategoria`. Lucide no
 * tiene semáforo: se usa el cono de tránsito (dispositivo de la vía), que no
 * se confunde con la valla de «Obra».
 */
export const PICTOGRAMA_DE_ICONO: Readonly<Record<IconoCategoria, LucideIcon>> = {
  BACHE: CircleDot,
  GRIETA: Activity,
  VEREDA: Footprints,
  SEMAFORO: TrafficCone,
  SENALIZACION: Signpost,
  CICLOVIA: Bike,
  DRENAJE: Droplets,
  ILUMINACION: Lightbulb,
  BARANDA: Fence,
  PUENTE: Bridge,
  ARBOL: TreeDeciduous,
  ESCOMBROS: Shovel,
  OBRA: Construction,
  OTRO: Ellipsis,
};

/** Categoría sin ícono (o con uno que esta versión no conoce). */
export const PICTOGRAMA_GENERICO: LucideIcon = Tag;

export function pictogramaDeCategoria(icono: string | null | undefined): LucideIcon {
  const conocido = iconoDeCategoria(icono);
  return conocido ? PICTOGRAMA_DE_ICONO[conocido] : PICTOGRAMA_GENERICO;
}

/**
 * Ícono de una categoría de daño. Decorativo (`aria-hidden`), como todo
 * {@link Icono}: siempre acompaña al nombre de la categoría, que es el que
 * lleva el sentido.
 */
export function IconoDeCategoria({
  icono,
  tamano,
  className,
}: {
  icono: string | null | undefined;
  tamano?: number;
  className?: string;
}) {
  return <Icono icono={pictogramaDeCategoria(icono)} tamano={tamano} className={className} />;
}

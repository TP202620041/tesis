/**
 * Tipos de la feature `moderacion` (NC-11b, D-15; ARCHITECTURE.md §5.1): el
 * area del ADMIN para ocultar y restablecer reportes o fotos y atender las
 * denuncias de los ciudadanos. Contrato:
 * `project-context/handoffs/2026-10-29-ocultar-y-denunciar.md`.
 *
 * springdoc marca todo como opcional y los enums como `string`; aqui se fija
 * lo que el backend garantiza y `api.ts` hace la traduccion. Todo lo de esta
 * feature trae datos de quien denuncio: solo se usa en el area ADMIN, nunca
 * en una vista de ciudadano ni de funcionario.
 */
import type { components } from '@/lib/api/generated/schema';
import type {
  AlcanceModeracion,
  EstadoDenuncia,
  HistorialEntrada,
  Severidad,
} from '@/lib/types/domain';

type Schemas = components['schemas'];

/** Respuestas crudas del API; solo `api.ts` las usa. */
export type ReporteModeracionResponse = Schemas['ReporteModeracionResponse'];
export type ReporteModeracionResumenResponse = Schemas['ReporteModeracionResumenResponse'];
export type DenunciaResponse = Schemas['DenunciaResponse'];
export type PaginaModeracionResponse = Schemas['PageReporteModeracionResumenResponse'];

/** Quien denuncio; `null` si cerro su cuenta (BE-14 anonimiza la denuncia). */
export interface Denunciante {
  id: number;
  nombre: string;
  email: string;
}

/** Una denuncia tal como la ve el ADMIN. */
export interface Denuncia {
  id: number;
  /** Uno de `MotivoDenuncia`; se deja abierto por si el backend suma uno. */
  motivo: string;
  estado: EstadoDenuncia;
  /** Lo que escribio el ciudadano; `null` si no escribio nada. */
  detalle: string | null;
  createdAt: string;
  denunciante: Denunciante | null;
  /** Cuando el ADMIN la atendio o desestimo; `null` mientras esta pendiente. */
  resueltaEn: string | null;
  /** El motivo que dio el ADMIN al ocultar o al desestimar; `null` si no lo hay. */
  motivoResolucion: string | null;
}

/** Que tiene oculto un reporte. */
export interface Visibilidad {
  tieneFoto: boolean;
  oculto: boolean;
  fotoOculta: boolean;
}

/**
 * El detalle de un reporte en el area de moderacion. Sin `fotoUrl`: la foto
 * se pide a `GET …/{id}/foto` con el token (puede estar oculta).
 */
export interface ReporteEnModeracion extends Visibilidad {
  id: number;
  latitud: number;
  longitud: number;
  titulo: string;
  descripcion: string | null;
  severidad: Severidad | null;
  categoriaNombre: string | null;
  estado: string;
  distritoNombre: string | null;
  createdAt: string;
  /** Todas, de la mas antigua a la mas nueva; puede estar vacia. */
  denuncias: Denuncia[];
}

/** Una fila de la bandeja. */
export interface FilaDeModeracion extends Visibilidad {
  reporteId: number;
  titulo: string;
  estado: string;
  distritoNombre: string | null;
  /** En el estado pedido; con «Ocultos», todas. */
  totalDenuncias: number;
  /** Cuantas por motivo (solo los presentes). */
  porMotivo: Record<string, number>;
  /** `null` si el reporte no tiene denuncias (solo con «Ocultos»). */
  primeraDenuncia: string | null;
  ultimaDenuncia: string | null;
}

export interface PaginaDeModeracion {
  filas: FilaDeModeracion[];
  /** Pagina mostrada, desde 0. */
  pagina: number;
  /** Al menos 1, aunque no haya filas. */
  totalPaginas: number;
  total: number;
}

/**
 * Que muestra la bandeja: las denuncias en un estado, u «Ocultos» (decision
 * del usuario del 30/10): los reportes con el reporte o la foto ocultos,
 * tengan denuncias o no.
 */
export type VistaDeBandeja = EstadoDenuncia | 'OCULTOS';

export interface FiltrosDeModeracion {
  vista: VistaDeBandeja;
  pagina: number;
}

/** Lo que el ADMIN envia al ocultar o restablecer (`ModerarContenidoRequest`). */
export interface OrdenDeModeracion {
  alcance: AlcanceModeracion;
  motivo: string;
}

export type AccionDeModeracion = 'ocultar' | 'restablecer';

/** El detalle con su linea de tiempo (la que el ADMIN ve completa). */
export interface DetalleDeModeracion {
  reporte: ReporteEnModeracion;
  historial: HistorialEntrada[];
}

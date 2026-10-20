import type { components } from '@/lib/api/generated/schema';
import { esFinalidadConsentimiento, type FinalidadConsentimiento } from '@/lib/types/domain';

/**
 * NC-07b (D-12): consentimientos del usuario por finalidad y version.
 *
 * El consentimiento es el **permiso** (Ley N.° 29733); la
 * `preferenciaNotificacion` del perfil sigue siendo solo la **preferencia**
 * de canal. Sin el consentimiento de correo no llegan avisos por correo
 * aunque la preferencia diga `EMAIL`.
 */

type Schemas = components['schemas'];

/** Una aceptacion (vigente, revocada o de una version anterior). */
export interface Consentimiento {
  id: number;
  finalidad: FinalidadConsentimiento;
  versionDocumento: string;
  aceptadoEn: string;
  /** `null` si no se revoco. */
  revocadoEn: string | null;
  vigente: boolean;
}

/** `GET /api/auth/me/consentimientos`, con los campos que siempre vienen. */
export interface Consentimientos {
  versionTerminosVigente: string;
  debeAceptarTerminos: boolean;
  /** Como maximo una por finalidad: la que autoriza hoy. */
  vigentes: Consentimiento[];
  /** Todas las aceptaciones, de la mas reciente a la mas antigua. */
  historial: Consentimiento[];
}

/**
 * Version del texto de cada aviso opcional. Para push y correo el backend
 * guarda la version tal cual, sin compararla: identifica QUE texto vio el
 * usuario al aceptar ({@link TEXTO_DE_FINALIDAD}). Si cambia el texto, sube
 * la version.
 */
export const VERSION_AVISO_PUSH = 'push-2026-10-v1';
export const VERSION_AVISO_CORREO = 'correo-2026-10-v1';

/** Finalidades opcionales que el usuario puede otorgar y revocar desde la app. */
export const FINALIDADES_OPCIONALES = ['NOTIFICACIONES_CORREO', 'NOTIFICACIONES_PUSH'] as const;
export type FinalidadOpcional = (typeof FINALIDADES_OPCIONALES)[number];

export function versionDeAviso(finalidad: FinalidadOpcional): string {
  return finalidad === 'NOTIFICACIONES_PUSH' ? VERSION_AVISO_PUSH : VERSION_AVISO_CORREO;
}

/** Nombre corto de cada finalidad para listas e historial. */
export function etiquetaDeFinalidad(finalidad: FinalidadConsentimiento): string {
  switch (finalidad) {
    case 'TERMINOS_Y_PRIVACIDAD':
      return 'Términos de uso y privacidad';
    case 'NOTIFICACIONES_PUSH':
      return 'Notificaciones push';
    case 'NOTIFICACIONES_CORREO':
      return 'Notificaciones por correo';
  }
}

/**
 * Texto que se muestra junto a cada casilla: es lo que el usuario acepta, y
 * su version es {@link versionDeAviso}. Sale de §5 del borrador
 * `project-context/legal/terminos-y-privacidad-v1.md`.
 */
export const TEXTO_DE_FINALIDAD: Record<FinalidadOpcional, string> = {
  NOTIFICACIONES_CORREO:
    'Avisos por correo cuando cambie el estado de tus reportes. Sin este consentimiento no te ' +
    'enviamos esos avisos por correo; los correos que tú pides (recuperar la contraseña, la ' +
    'respuesta de soporte) se envían siempre.',
  NOTIFICACIONES_PUSH:
    'Notificaciones push en tus navegadores cuando cambie el estado de tus reportes. Si lo ' +
    'retiras, dejamos de enviarte push en todos tus navegadores.',
};

/**
 * Por que no se ofrece revocar los terminos: retirarlos es la baja de la
 * cuenta (§5 y §7 del borrador). El backend responde 409 si se intenta.
 */
export const TEXTO_TERMINOS_NO_REVOCABLES =
  'Los términos de uso y privacidad son obligatorios para usar la plataforma. Para dejar de ' +
  'aceptarlos hay que cerrar la cuenta: escríbenos desde Soporte.';

/** Traduce la respuesta del API, descartando finalidades que este cliente no conoce. */
export function desdeRespuestaDeConsentimientos(
  r: Schemas['ConsentimientosResponse'],
): Consentimientos {
  return {
    versionTerminosVigente: r.versionTerminosVigente ?? '',
    debeAceptarTerminos: r.debeAceptarTerminos === true,
    vigentes: (r.vigentes ?? []).flatMap(aConsentimiento),
    historial: (r.historial ?? []).flatMap(aConsentimiento),
  };
}

function aConsentimiento(c: Schemas['ConsentimientoResponse']): Consentimiento[] {
  if (c.id == null || !esFinalidadConsentimiento(c.finalidad)) return [];
  return [
    {
      id: c.id,
      finalidad: c.finalidad,
      versionDocumento: c.versionDocumento ?? '',
      aceptadoEn: c.aceptadoEn ?? '',
      revocadoEn: c.revocadoEn ?? null,
      vigente: c.vigente === true,
    },
  ];
}

/** El consentimiento que autoriza hoy esa finalidad, o `null`. */
export function vigenteDe(
  consentimientos: Pick<Consentimientos, 'vigentes'>,
  finalidad: FinalidadConsentimiento,
): Consentimiento | null {
  return consentimientos.vigentes.find((c) => c.finalidad === finalidad && c.vigente) ?? null;
}

export function tieneVigente(
  consentimientos: Pick<Consentimientos, 'vigentes'>,
  finalidad: FinalidadConsentimiento,
): boolean {
  return vigenteDe(consentimientos, finalidad) !== null;
}

/** Estado de una fila del historial, en palabras. */
export function estadoDeConsentimiento(c: Consentimiento): 'Vigente' | 'Revocado' | 'Versión anterior' {
  if (c.vigente) return 'Vigente';
  if (c.revocadoEn) return 'Revocado';
  return 'Versión anterior';
}

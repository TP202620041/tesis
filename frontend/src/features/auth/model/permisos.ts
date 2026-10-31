import type { Usuario } from '@/lib/types/domain';

/**
 * US-27: puede escribir un comentario publico sobre un reporte resuelto.
 *
 * Exige sesion de ciudadano; el funcionario gestiona, no opina (y el admin
 * tampoco). Es ayuda de UX: el backend valida el rol igual. `null` = sin
 * sesion (o todavia verificandola).
 */
export function puedeComentarReportes(usuario: Pick<Usuario, 'rol'> | null): boolean {
  return usuario?.rol === 'CIUDADANO';
}

/**
 * NC-11b (D-15): puede denunciar un reporte publicado. Solo el CIUDADANO
 * (el backend responde 403 al funcionario y al ADMIN, que modera, no
 * denuncia). Si el reporte es suyo lo decide `useEsReportePropio`, no esto.
 */
export function puedeDenunciarReportes(usuario: Pick<Usuario, 'rol'> | null): boolean {
  return usuario?.rol === 'CIUDADANO';
}

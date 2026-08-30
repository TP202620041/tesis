import type { Rol } from '@/lib/types/domain';

/**
 * Pantalla inicial de cada rol tras iniciar sesion.
 *
 * Ciudadano y funcionario usan la misma aplicacion pero no la misma puerta
 * de entrada: al ciudadano le importan sus reportes y el mapa; al
 * funcionario, la bandeja de su distrito (US-13), que es su herramienta de
 * trabajo.
 */
export function rutaInicialDe(rol: Rol): string {
  switch (rol) {
    case 'FUNCIONARIO_MUNICIPAL':
      return '/bandeja';
    case 'ADMIN':
      // El admin solo responde tickets de soporte (US-25) por ahora; hasta
      // que tenga vista propia, entra por la pantalla de sesion.
      return '/sesion';
    case 'CIUDADANO':
      // Sus propios reportes, no el mapa publico: quien inicia sesion lo
      // hace para reportar o para ver como van los suyos. El mapa sigue
      // siendo la puerta publica, sin cuenta.
      return '/mis-reportes';
  }
}

/** Roles que pueden entrar a cada area protegida del cliente. */
export const ROLES_AREA_MUNICIPAL: readonly Rol[] = ['FUNCIONARIO_MUNICIPAL'];

/**
 * `true` si el rol puede ver un area.
 *
 * Es una comodidad de UX, NO la autorizacion: el backend la impone con
 * `@PreAuthorize` y la validacion de jurisdiccion por distrito. Aqui solo se
 * evita que el usuario vea cargar una pantalla que terminara en 403.
 */
export function puedeAcceder(rol: Rol, rolesPermitidos: readonly Rol[]): boolean {
  return rolesPermitidos.includes(rol);
}

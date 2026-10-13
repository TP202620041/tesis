import { describe, expect, it } from 'vitest';
import { puedeAcceder, rutaInicialDe, ROLES_AREA_MUNICIPAL } from './rutas';
import { ROLES } from '@/lib/types/domain';

describe('rutaInicialDe', () => {
  it('lleva al funcionario a su bandeja', () => {
    expect(rutaInicialDe('FUNCIONARIO_MUNICIPAL')).toBe('/bandeja');
  });

  it('lleva al ciudadano a sus propios reportes', () => {
    // No al mapa público: quien inicia sesión lo hace para reportar o para
    // ver cómo van los suyos.
    expect(rutaInicialDe('CIUDADANO')).toBe('/mis-reportes');
  });

  it('da una ruta a todos los roles del backend', () => {
    // Recorre el enum real: un rol nuevo sin destino dejaría el login
    // mandando al usuario a `undefined`.
    for (const rol of ROLES) {
      expect(rutaInicialDe(rol)).toMatch(/^\//);
    }
  });

  it('no manda al ciudadano a un área municipal', () => {
    expect(rutaInicialDe('CIUDADANO')).not.toBe(rutaInicialDe('FUNCIONARIO_MUNICIPAL'));
  });
});

describe('puedeAcceder', () => {
  it('deja entrar al funcionario al área municipal', () => {
    expect(puedeAcceder('FUNCIONARIO_MUNICIPAL', ROLES_AREA_MUNICIPAL)).toBe(true);
  });

  it('no deja entrar al ciudadano ni al admin', () => {
    // El backend lo impone con @PreAuthorize; esto solo evita que el
    // usuario vea cargar una pantalla que terminaría en 403.
    expect(puedeAcceder('CIUDADANO', ROLES_AREA_MUNICIPAL)).toBe(false);
    expect(puedeAcceder('ADMIN', ROLES_AREA_MUNICIPAL)).toBe(false);
  });
});

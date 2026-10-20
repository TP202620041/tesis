import { describe, expect, it } from 'vitest';
import { puedeComentarReportes } from './permisos';

describe('puedeComentarReportes', () => {
  it('solo el ciudadano con sesion puede comentar', () => {
    expect(puedeComentarReportes({ rol: 'CIUDADANO' })).toBe(true);
  });

  it('el funcionario y el admin no comentan', () => {
    expect(puedeComentarReportes({ rol: 'FUNCIONARIO_MUNICIPAL' })).toBe(false);
    expect(puedeComentarReportes({ rol: 'ADMIN' })).toBe(false);
  });

  it('sin sesion no se comenta', () => {
    expect(puedeComentarReportes(null)).toBe(false);
  });
});

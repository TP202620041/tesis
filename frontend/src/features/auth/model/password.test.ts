import { describe, expect, it } from 'vitest';
import {
  AYUDA_PASSWORD,
  PASSWORD_MAX,
  PASSWORD_MIN,
  errorDeLargoDePassword,
  erroresDePasswordNueva,
  normalizarToken,
} from './password';

describe('erroresDePasswordNueva', () => {
  it('acepta una contraseña en el rango que coincide con su confirmación', () => {
    expect(erroresDePasswordNueva('secreta123', 'secreta123')).toEqual([]);
  });

  it('acepta exactamente los límites del backend (8 y 72)', () => {
    const minima = 'a'.repeat(PASSWORD_MIN);
    const maxima = 'a'.repeat(PASSWORD_MAX);
    expect(erroresDePasswordNueva(minima, minima)).toEqual([]);
    expect(erroresDePasswordNueva(maxima, maxima)).toEqual([]);
  });

  it('rechaza una contraseña corta', () => {
    expect(erroresDePasswordNueva('corta', 'corta')).toEqual([
      'La contraseña debe tener al menos 8 caracteres.',
    ]);
  });

  it('rechaza una contraseña de más de 72 caracteres', () => {
    const larga = 'a'.repeat(PASSWORD_MAX + 1);
    expect(erroresDePasswordNueva(larga, larga)).toEqual([
      'La contraseña no puede tener más de 72 caracteres.',
    ]);
  });

  it('avisa si la confirmación no coincide, además del largo', () => {
    expect(erroresDePasswordNueva('corta', 'otra')).toEqual([
      'La contraseña debe tener al menos 8 caracteres.',
      'Las contraseñas no coinciden.',
    ]);
  });
});

describe('errorDeLargoDePassword (QA-1 M-2: el registro valida antes de enviar)', () => {
  it('nada que decir dentro de los límites', () => {
    expect(errorDeLargoDePassword('a'.repeat(PASSWORD_MIN))).toBeNull();
    expect(errorDeLargoDePassword('a'.repeat(PASSWORD_MAX))).toBeNull();
  });

  it('explica el mínimo y el máximo en castellano', () => {
    expect(errorDeLargoDePassword('abc')).toBe('La contraseña debe tener al menos 8 caracteres.');
    expect(errorDeLargoDePassword('a'.repeat(PASSWORD_MAX + 1))).toBe(
      'La contraseña no puede tener más de 72 caracteres.',
    );
  });

  it('la ayuda previa dice el mínimo', () => {
    expect(AYUDA_PASSWORD).toBe('Mínimo 8 caracteres.');
  });
});

describe('normalizarToken', () => {
  it('quita espacios y saltos de línea copiados del correo', () => {
    expect(normalizarToken('  3f2a-11\n  bc ')).toBe('3f2a-11bc');
  });

  it('deja intacto un token limpio', () => {
    const uuid = '0b9c2f7e-8a41-4d1e-9a3c-5e2b7d9f1a00';
    expect(normalizarToken(uuid)).toBe(uuid);
  });
});

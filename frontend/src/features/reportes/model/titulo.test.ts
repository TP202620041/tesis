import { describe, expect, it } from 'vitest';
import { errorDelTitulo, esTituloValido, largoDelTitulo, tituloSugerido } from './titulo';

describe('largoDelTitulo (NC-02)', () => {
  it('cuenta sin los espacios del borde', () => {
    expect(largoDelTitulo('  Bache  ')).toBe(5);
  });

  it('cuenta code points como el backend: un emoji es 1, no 2', () => {
    expect('😀'.length).toBe(2);
    expect(largoDelTitulo('Hoyo😀')).toBe(5);
  });
});

describe('errorDelTitulo', () => {
  it('exige título', () => {
    expect(errorDelTitulo('')).toBe('Escribe un título para el reporte.');
    expect(errorDelTitulo('    ')).toBe('Escribe un título para el reporte.');
    expect(errorDelTitulo(undefined)).toBe('Escribe un título para el reporte.');
  });

  it('acepta de 5 a 120 caracteres tras el trim, ambos incluidos', () => {
    expect(errorDelTitulo(' Hoyo ')).toMatch(/al menos 5/);
    expect(errorDelTitulo('  Bache  ')).toBeNull();
    expect(errorDelTitulo('x'.repeat(120))).toBeNull();
    expect(errorDelTitulo(` ${'x'.repeat(120)} `)).toBeNull();
    expect(errorDelTitulo('x'.repeat(121))).toMatch(/como máximo 120/);
  });

  it('120 emojis son 120 caracteres (240 unidades UTF-16) y valen', () => {
    expect(esTituloValido('😀'.repeat(120))).toBe(true);
    expect(esTituloValido('😀'.repeat(121))).toBe(false);
  });
});

describe('tituloSugerido', () => {
  it('arma «<categoría> en <distrito>», como la migración V17', () => {
    expect(tituloSugerido('Bache', 'Miraflores')).toBe('Bache en Miraflores');
  });

  it('queda vacío si falta la categoría o el distrito', () => {
    expect(tituloSugerido(null, 'Miraflores')).toBe('');
    expect(tituloSugerido('Bache', undefined)).toBe('');
    expect(tituloSugerido('  ', 'Surco')).toBe('');
  });

  it('queda vacío si el resultado no sería un título válido', () => {
    expect(tituloSugerido('x'.repeat(100), 'y'.repeat(30))).toBe('');
  });
});

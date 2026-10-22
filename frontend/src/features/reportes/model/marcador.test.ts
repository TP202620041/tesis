import { describe, expect, it } from 'vitest';
import { nombreDeMarcador } from './marcador';

describe('nombreDeMarcador (QA-1 M-7)', () => {
  it('dice título, estado y tipo de daño', () => {
    expect(
      nombreDeMarcador({ titulo: 'Bache frente al parque', estado: 'EN_PROCESO', categoriaNombre: 'Bache' }),
    ).toBe('Bache frente al parque. Estado: en proceso. Tipo: Bache');
  });

  it('el estado va en palabras: en el mapa solo se distingue por el color', () => {
    expect(nombreDeMarcador({ titulo: 'X', estado: 'RESUELTO', categoriaNombre: 'Bache' })).toContain(
      'Estado: resuelto',
    );
  });

  it('degrada sin romper si faltan datos', () => {
    expect(nombreDeMarcador({ titulo: undefined, estado: undefined, categoriaNombre: '  ' })).toBe(
      'Sin título. Estado: desconocido',
    );
  });
});

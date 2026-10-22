import { describe, expect, it } from 'vitest';
import { FOTO_NO_DISPONIBLE, nombreDelReemplazo } from './fotoDeReporte';

describe('nombreDelReemplazo (QA-1 M-3)', () => {
  it('conserva el texto alternativo y agrega el aviso', () => {
    expect(nombreDelReemplazo('Foto del daño reportado: Bache')).toBe(
      'Foto del daño reportado: Bache (foto no disponible)',
    );
  });

  it('una foto decorativa sigue siéndolo', () => {
    expect(nombreDelReemplazo('')).toBeNull();
    expect(nombreDelReemplazo('   ')).toBeNull();
  });

  it('el texto visible', () => {
    expect(FOTO_NO_DISPONIBLE).toBe('Foto no disponible');
  });
});

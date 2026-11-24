import { describe, expect, it } from 'vitest';
import { acotarPaso, esPrimerPaso, esUltimoPaso, PASOS, RUTA_GUIA, textoDeProgreso } from './pasos';

describe('pasos de la guía (US-24)', () => {
  it('cubren reportar y hacer seguimiento, con ids únicos', () => {
    const ids = PASOS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(expect.arrayContaining(['reportar', 'seguimiento']));
  });

  it('cada paso tiene texto, puntos, descripción de su ilustración y un enlace interno', () => {
    for (const paso of PASOS) {
      expect(paso.titulo).not.toBe('');
      expect(paso.resumen).not.toBe('');
      expect(paso.puntos.length).toBeGreaterThan(0);
      expect(paso.descripcionIlustracion).not.toBe('');
      expect(paso.enlace.href).toMatch(/^\/[a-z-]+$/);
    }
  });

  it('acotarPaso nunca sale del rango', () => {
    expect(acotarPaso(-3, 6)).toBe(0);
    expect(acotarPaso(2, 6)).toBe(2);
    expect(acotarPaso(99, 6)).toBe(5);
    expect(acotarPaso(Number.NaN, 6)).toBe(0);
    expect(acotarPaso(1.7, 6)).toBe(1);
    expect(acotarPaso(3, 0)).toBe(0);
  });

  it('primero, último y progreso', () => {
    expect(esPrimerPaso(0)).toBe(true);
    expect(esPrimerPaso(1)).toBe(false);
    expect(esUltimoPaso(5, 6)).toBe(true);
    expect(esUltimoPaso(4, 6)).toBe(false);
    expect(textoDeProgreso(1, 6)).toBe('Paso 2 de 6');
    expect(textoDeProgreso(0)).toBe(`Paso 1 de ${PASOS.length}`);
  });

  it('la ruta de la guía es la del menú', () => {
    expect(RUTA_GUIA).toBe('/como-funciona');
  });
});

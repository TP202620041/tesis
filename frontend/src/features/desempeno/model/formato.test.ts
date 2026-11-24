import { describe, expect, it } from 'vitest';
import {
  alternarOrden,
  anchoBarra,
  formatearSatisfaccion,
  formatearTasa,
  formatearTiempo,
  ORDEN_INICIAL,
  SIN_DATOS,
} from './formato';

// Nota de localización: `es-PE` usa PUNTO como separador decimal y coma
// para miles (1,234.56), a diferencia de `es-ES` (1.234,56). Es la
// convención del Perú y por tanto la correcta para esta aplicación; estas
// expectativas la fijan para que nadie la "corrija" a la española.
describe('formatearTasa', () => {
  it('muestra el porcentaje tal como lo entrega el backend (0..100)', () => {
    // El backend ya calcula 100.0 * resueltos / total: si aquí se
    // multiplicara otra vez, saldrían porcentajes absurdos.
    expect(formatearTasa(35.5)).toBe('35.5 %');
    expect(formatearTasa(100)).toBe('100 %');
  });

  it('distingue 0 % de "sin datos"', () => {
    // Un distrito con reportes y ninguno resuelto tiene 0 %; uno sin
    // reportes no tiene tasa. Confundirlos acusaría de mal desempeño a
    // quien simplemente no recibió reportes.
    expect(formatearTasa(0)).toBe('0 %');
    expect(formatearTasa(null)).toBe(SIN_DATOS);
    expect(formatearTasa(undefined)).toBe(SIN_DATOS);
  });
});

describe('formatearTiempo', () => {
  it('usa horas por debajo de un día', () => {
    expect(formatearTiempo(5.5)).toBe('5.5 h');
    expect(formatearTiempo(23)).toBe('23 h');
  });

  it('pasa a días cuando el número de horas deja de decir algo', () => {
    expect(formatearTiempo(24)).toBe('1 d');
    expect(formatearTiempo(36)).toBe('1 d 12 h');
    expect(formatearTiempo(72)).toBe('3 d');
  });

  it('no produce "1 d 24 h" al redondear', () => {
    // 47,8 h redondea a 48 horas de resto: debe ser 2 d.
    expect(formatearTiempo(47.8)).toBe('2 d');
  });

  it('sin resueltos no hay tiempo promedio', () => {
    expect(formatearTiempo(null)).toBe(SIN_DATOS);
  });

  it('QA-1 M-12: menos de una hora no se muestra como «0 h»', () => {
    // San Miguel promedió 0,01 h: «0 h» parecía cero o falta de dato.
    expect(formatearTiempo(0.01)).toBe('< 1 h');
    expect(formatearTiempo(0.96)).toBe('< 1 h');
    expect(formatearTiempo(0)).toBe('< 1 h');
    expect(formatearTiempo(1)).toBe('1 h');
  });
});

describe('formatearSatisfaccion', () => {
  it('muestra la nota sobre 5', () => {
    expect(formatearSatisfaccion(4.25)).toBe('4.3 / 5');
    expect(formatearSatisfaccion(3)).toBe('3 / 5');
  });

  it('sin calificaciones no hay promedio', () => {
    expect(formatearSatisfaccion(null)).toBe(SIN_DATOS);
  });
});

describe('anchoBarra', () => {
  it('usa la tasa como porcentaje de ancho', () => {
    expect(anchoBarra(42)).toBe(42);
  });

  it('sin datos no dibuja barra', () => {
    expect(anchoBarra(null)).toBe(0);
  });

  it('acota valores fuera de rango', () => {
    // Defensivo: una barra de ancho negativo o >100 rompería el layout.
    expect(anchoBarra(-5)).toBe(0);
    expect(anchoBarra(150)).toBe(100);
  });
});

describe('alternarOrden', () => {
  it('invierte la dirección al pulsar la misma columna', () => {
    expect(alternarOrden({ columna: 'tasa', descendente: true }, 'tasa')).toEqual({
      columna: 'tasa',
      descendente: false,
    });
  });

  it('al cambiar de columna arranca en la dirección más útil', () => {
    // Más tasa es mejor; menos tiempo de atención es mejor.
    expect(alternarOrden(ORDEN_INICIAL, 'satisfaccion').descendente).toBe(true);
    expect(alternarOrden(ORDEN_INICIAL, 'reportes').descendente).toBe(true);
    expect(alternarOrden(ORDEN_INICIAL, 'tiempo').descendente).toBe(false);
    expect(alternarOrden(ORDEN_INICIAL, 'distrito').descendente).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import { esDiaValido, finDelDiaLocal, inicioDelDiaLocal, rangoDeDiasInvertido } from './fechas';

describe('fechas de día local', () => {
  it('«desde» es la medianoche local del día, como instante ISO', () => {
    // Se compara contra la misma fecha construida en la zona del navegador:
    // el test vale en cualquier zona horaria.
    expect(inicioDelDiaLocal('2026-10-05')).toBe(new Date(2026, 9, 5, 0, 0, 0, 0).toISOString());
  });

  it('«hasta» incluye el día completo', () => {
    expect(finDelDiaLocal('2026-10-05')).toBe(
      new Date(2026, 9, 5, 23, 59, 59, 999).toISOString(),
    );
  });

  it('el mismo día como desde y hasta cubre 24 horas menos un milisegundo', () => {
    const inicio = Date.parse(inicioDelDiaLocal('2026-03-01'));
    const fin = Date.parse(finDelDiaLocal('2026-03-01'));
    expect(fin - inicio).toBe(24 * 60 * 60 * 1000 - 1);
  });

  it('reconoce días válidos e inválidos', () => {
    expect(esDiaValido('2026-02-28')).toBe(true);
    expect(esDiaValido('2026-02-31')).toBe(false);
    expect(esDiaValido('2026-13-01')).toBe(false);
    expect(esDiaValido('05/10/2026')).toBe(false);
    expect(esDiaValido('')).toBe(false);
    expect(esDiaValido(null)).toBe(false);
  });

  it('detecta el rango invertido solo con los dos extremos', () => {
    expect(rangoDeDiasInvertido('2026-10-06', '2026-10-05')).toBe(true);
    expect(rangoDeDiasInvertido('2026-10-05', '2026-10-05')).toBe(false);
    expect(rangoDeDiasInvertido('2026-09-30', '2026-10-01')).toBe(false);
    expect(rangoDeDiasInvertido('2026-10-06', null)).toBe(false);
    expect(rangoDeDiasInvertido(null, '2026-10-05')).toBe(false);
  });
});

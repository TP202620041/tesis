import { describe, expect, it } from 'vitest';
import {
  esperaTrasFallos,
  puedeEnviarConFoto,
  trasModeracionNoDisponible,
} from './esperaDeModeracion';

const T0 = new Date('2026-10-29T12:00:00Z');
const mas = (ms: number) => new Date(T0.getTime() + ms);

describe('esperaTrasFallos (NC-10c)', () => {
  it('sigue 30 s, 1, 2, 4 y 8 min y se queda en 10 min', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 50].map(esperaTrasFallos)).toEqual([
      30_000, 60_000, 120_000, 240_000, 480_000, 600_000, 600_000, 600_000,
    ]);
  });

  it('trata un conteo menor que 1 como el primer fallo', () => {
    expect(esperaTrasFallos(0)).toBe(30_000);
  });
});

describe('trasModeracionNoDisponible y puedeEnviarConFoto', () => {
  it('sin espera previa se puede enviar', () => {
    expect(puedeEnviarConFoto(null, T0)).toBe(true);
  });

  it('el primer 503 hace esperar 30 s', () => {
    const espera = trasModeracionNoDisponible(null, T0);
    expect(espera).toEqual({ fallosSeguidos: 1, reintentarDesde: T0.getTime() + 30_000 });
    expect(puedeEnviarConFoto(espera, mas(29_999))).toBe(false);
    expect(puedeEnviarConFoto(espera, mas(30_000))).toBe(true);
  });

  it('cada 503 seguido duplica la espera, contada desde ese intento', () => {
    let espera = trasModeracionNoDisponible(null, T0);
    espera = trasModeracionNoDisponible(espera, mas(30_000));
    expect(espera).toEqual({ fallosSeguidos: 2, reintentarDesde: T0.getTime() + 90_000 });
    espera = trasModeracionNoDisponible(espera, mas(90_000));
    expect(espera.reintentarDesde).toBe(T0.getTime() + 210_000);
  });
});

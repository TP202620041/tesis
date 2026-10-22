import { describe, expect, it } from 'vitest';
import { enlaceOpenStreetMap, textoDeCoordenadas, ubicacionValida } from './ubicacion';

const KENNEDY = { latitud: -12.118, longitud: -77.032 };

describe('ubicacionValida', () => {
  it('acepta coordenadas en rango', () => {
    expect(ubicacionValida(-12.118, -77.032)).toEqual(KENNEDY);
  });

  it('sin alguna coordenada no hay ubicación (no se dibuja un punto en 0, 0)', () => {
    expect(ubicacionValida(null, -77.032)).toBeNull();
    expect(ubicacionValida(-12.118, undefined)).toBeNull();
  });

  it('descarta valores imposibles', () => {
    expect(ubicacionValida(Number.NaN, -77)).toBeNull();
    expect(ubicacionValida(-12, Number.POSITIVE_INFINITY)).toBeNull();
    expect(ubicacionValida(-91, -77)).toBeNull();
    expect(ubicacionValida(-12, 181)).toBeNull();
  });

  it('el 0 es una coordenada, no «sin dato»', () => {
    expect(ubicacionValida(0, 0)).toEqual({ latitud: 0, longitud: 0 });
  });
});

describe('textoDeCoordenadas', () => {
  it('latitud y longitud con 5 decimales (~1 m) y punto decimal', () => {
    expect(textoDeCoordenadas(KENNEDY)).toBe('-12.11800, -77.03200');
    expect(textoDeCoordenadas({ latitud: -12.1234567, longitud: -77.0000049 })).toBe(
      '-12.12346, -77.00000',
    );
  });
});

describe('enlaceOpenStreetMap', () => {
  it('marca el punto y centra el mapa en él, a escala de calle', () => {
    const url = new URL(enlaceOpenStreetMap(KENNEDY));
    expect(url.origin).toBe('https://www.openstreetmap.org');
    expect(url.searchParams.get('mlat')).toBe('-12.118000');
    expect(url.searchParams.get('mlon')).toBe('-77.032000');
    expect(url.hash).toBe('#map=18/-12.118000/-77.032000');
  });
});

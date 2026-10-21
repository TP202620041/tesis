import { describe, expect, it } from 'vitest';
import { esSeveridad, SEVERIDADES } from './domain';
import {
  etiquetaDeSeveridad,
  OPCIONES_DE_SEVERIDAD,
  SIN_TITULO,
  textoDeSeveridad,
  tituloVisible,
} from './tituloYSeveridad';

describe('severidad (NC-02)', () => {
  it('tres valores de menor a mayor, como el enum del backend', () => {
    expect(SEVERIDADES).toEqual(['BAJA', 'MEDIA', 'ALTA']);
    expect(OPCIONES_DE_SEVERIDAD.map((o) => o.etiqueta)).toEqual(['Baja', 'Media', 'Alta']);
  });

  it('reconoce solo los valores del enum', () => {
    expect(esSeveridad('ALTA')).toBe(true);
    expect(esSeveridad('alta')).toBe(false);
    expect(esSeveridad(null)).toBe(false);
  });

  it('sin severidad o con una desconocida no rompe: no hay etiqueta', () => {
    expect(etiquetaDeSeveridad('MEDIA')).toBe('Media');
    expect(etiquetaDeSeveridad(null)).toBeNull();
    expect(etiquetaDeSeveridad('CRITICA')).toBeNull();
    expect(textoDeSeveridad('ALTA')).toBe('Severidad alta');
    expect(textoDeSeveridad(undefined)).toBeNull();
  });
});

describe('tituloVisible (NC-02)', () => {
  it('muestra el título, o «Sin título» si llegó null (respuesta anterior a NC-02)', () => {
    expect(tituloVisible('Bache en Miraflores')).toBe('Bache en Miraflores');
    expect(tituloVisible(null)).toBe(SIN_TITULO);
    expect(tituloVisible(undefined)).toBe('Sin título');
    expect(tituloVisible('   ')).toBe('Sin título');
  });
});

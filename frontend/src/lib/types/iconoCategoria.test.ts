import { describe, expect, it } from 'vitest';
import {
  esIconoCategoria,
  ETIQUETA_DE_ICONO,
  ICONOS_CATEGORIA,
  iconoDeCategoria,
} from './iconoCategoria';

describe('IconoCategoria (US-29 / US-34)', () => {
  it('es el enum cerrado de 14 valores del backend', () => {
    expect(ICONOS_CATEGORIA).toHaveLength(14);
    // Los de las 3 estándar nuevas de US-34.
    expect(ICONOS_CATEGORIA).toEqual(expect.arrayContaining(['CICLOVIA', 'DRENAJE', 'ILUMINACION']));
  });

  it('cada valor tiene su nombre en español', () => {
    for (const valor of ICONOS_CATEGORIA) expect(ETIQUETA_DE_ICONO[valor]).toBeTruthy();
    expect(ETIQUETA_DE_ICONO.SEMAFORO).toBe('Semáforo');
  });

  it('lo que llega del API: valor conocido o null (ícono genérico)', () => {
    expect(iconoDeCategoria('BACHE')).toBe('BACHE');
    expect(iconoDeCategoria(null)).toBeNull();
    expect(iconoDeCategoria(undefined)).toBeNull();
    expect(iconoDeCategoria('COHETE')).toBeNull();
    expect(esIconoCategoria('bache')).toBe(false);
  });
});

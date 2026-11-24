import { describe, expect, it } from 'vitest';
import {
  agregarDistrito,
  depurarComparacion,
  distritosComparados,
  leerComparacion,
  MAX_COMPARAR,
  queryDeComparacion,
  quitarDistrito,
} from './comparacion';
import type { KpiGestion } from './gestion';

const leer = (query: string) => leerComparacion(new URLSearchParams(query));

describe('leerComparacion (US-19)', () => {
  it('lee los distritos en orden, el periodo y el tipo de daño', () => {
    expect(leer('comparar=21,41&periodo=2&categoria=3')).toEqual({
      distritos: [21, 41],
      periodoId: 2,
      categoriaId: 3,
    });
  });

  it('sin parámetros no hay comparación ni filtro, y el periodo es el vigente (null)', () => {
    expect(leer('')).toEqual({ distritos: [], periodoId: null, categoriaId: null });
  });

  it('tolera una URL editada a mano: descarta basura y repetidos', () => {
    expect(leer('comparar=21,abc,21,-4,0,41,&periodo=-1&categoria=x')).toEqual({
      distritos: [21, 41],
      periodoId: null,
      categoriaId: null,
    });
  });

  it(`se queda con los primeros ${MAX_COMPARAR}`, () => {
    expect(leer('comparar=1,2,3,4,5,6').distritos).toEqual([1, 2, 3, 4]);
  });
});

describe('queryDeComparacion', () => {
  it('es legible y se puede volver a leer', () => {
    const estado = { distritos: [21, 41], periodoId: 1, categoriaId: 3 };
    const query = queryDeComparacion(estado);
    expect(query).toBe('comparar=21,41&periodo=1&categoria=3');
    expect(leer(query)).toEqual(estado);
  });

  it('omite lo que no está elegido', () => {
    expect(queryDeComparacion({ distritos: [], periodoId: null, categoriaId: null })).toBe('');
    expect(queryDeComparacion({ distritos: [], periodoId: null, categoriaId: 5 })).toBe('categoria=5');
    expect(queryDeComparacion({ distritos: [], periodoId: 2, categoriaId: null })).toBe('periodo=2');
    expect(queryDeComparacion({ distritos: [7], periodoId: null, categoriaId: null })).toBe('comparar=7');
  });
});

describe('agregarDistrito / quitarDistrito', () => {
  it('agrega al final y no duplica', () => {
    expect(agregarDistrito([21], 41)).toEqual({ agregado: true, distritos: [21, 41] });
    expect(agregarDistrito([21, 41], 21)).toEqual({ agregado: true, distritos: [21, 41] });
  });

  it('con el máximo elegido no agrega e informa el motivo', () => {
    expect(agregarDistrito([1, 2, 3, 4], 5)).toEqual({
      agregado: false,
      distritos: [1, 2, 3, 4],
      motivo: 'maximo',
    });
  });

  it('quita sin alterar el orden del resto', () => {
    expect(quitarDistrito([1, 2, 3], 2)).toEqual([1, 3]);
  });
});

describe('depurarComparacion', () => {
  const conocidos = new Map([
    [21, 'Miraflores'],
    [41, 'San Juan de Lurigancho'],
  ]);

  it('descarta distritos, tipos de daño y periodos que el catálogo no conoce', () => {
    expect(
      depurarComparacion({ distritos: [21, 999, 41], periodoId: 9, categoriaId: 77 }, conocidos, [1, 3], [1, 2]),
    ).toEqual({
      distritos: [21, 41],
      periodoId: null,
      categoriaId: null,
    });
  });

  it('conserva un periodo conocido', () => {
    expect(depurarComparacion({ distritos: [], periodoId: 2, categoriaId: null }, null, null, [1, 2]).periodoId).toBe(2);
  });

  it('mientras un catálogo no cargó, no descarta nada de esa parte', () => {
    const estado = { distritos: [21, 999], periodoId: 9, categoriaId: 77 };
    expect(depurarComparacion(estado, null, null, null)).toEqual(estado);
  });
});

describe('distritosComparados', () => {
  const miraflores: KpiGestion = {
    distritoId: 21,
    distritoNombre: 'Miraflores',
    municipalidadNombre: 'Municipalidad de Miraflores',
    categoriaId: null,
    reportesValidos: 18,
    reportesResueltos: 12,
    tasaResolucion: 66.67,
    tiempoPromedioDias: 2.4,
    satisfaccionPromedio: null,
    totalCalificaciones: 0,
  };
  const nombres = new Map([
    [21, 'Miraflores'],
    [41, 'San Juan de Lurigancho'],
  ]);

  it('respeta el orden de la selección y marca sin fila al que no tiene datos', () => {
    expect(distritosComparados([41, 21], [miraflores], nombres)).toEqual([
      { distritoId: 41, nombre: 'San Juan de Lurigancho', fila: null },
      { distritoId: 21, nombre: 'Miraflores', fila: miraflores },
    ]);
  });

  it('sin nombre en el catálogo no rompe', () => {
    expect(distritosComparados([99], [], new Map())[0]?.nombre).toBe('Distrito 99');
  });
});

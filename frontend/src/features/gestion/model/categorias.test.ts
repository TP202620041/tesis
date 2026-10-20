import { describe, expect, it } from 'vitest';
import {
  cuerpoDeCategoria,
  datosDe,
  erroresDeCategoria,
  etiquetaDeActiva,
  MAX_DESCRIPCION_CATEGORIA,
  MAX_NOMBRE_CATEGORIA,
  separarCategorias,
  type CategoriaGestion,
} from './categorias';

function categoria(extra: Partial<CategoriaGestion>): CategoriaGestion {
  return {
    id: 1,
    nombre: 'Bache',
    descripcion: null,
    esEstandar: true,
    activo: true,
    distritoId: null,
    distritoNombre: null,
    ...extra,
  };
}

describe('separarCategorias', () => {
  it('separa las estándar de las propias, conservando las inactivas', () => {
    const { estandar, propias } = separarCategorias([
      categoria({ id: 1 }),
      categoria({ id: 58, esEstandar: false, activo: false, distritoId: 15 }),
      categoria({ id: 57, esEstandar: false, distritoId: 15 }),
    ]);
    expect(estandar.map((c) => c.id)).toEqual([1]);
    expect(propias.map((c) => c.id)).toEqual([58, 57]);
  });
});

describe('erroresDeCategoria', () => {
  it('exige nombre y respeta los límites del backend', () => {
    expect(erroresDeCategoria({ nombre: '  ', descripcion: '' })).toEqual([
      'Escribe el nombre de la categoría.',
    ]);
    expect(
      erroresDeCategoria({
        nombre: 'n'.repeat(MAX_NOMBRE_CATEGORIA + 1),
        descripcion: 'd'.repeat(MAX_DESCRIPCION_CATEGORIA + 1),
      }),
    ).toHaveLength(2);
    expect(erroresDeCategoria({ nombre: 'Malecon', descripcion: '' })).toEqual([]);
  });
});

describe('cuerpoDeCategoria (el PATCH reemplaza)', () => {
  it('envía siempre los dos campos; la descripción vacía viaja como null', () => {
    expect(cuerpoDeCategoria({ nombre: ' Malecon ', descripcion: '   ' })).toEqual({
      nombre: 'Malecon',
      descripcion: null,
    });
  });

  it('al editar parte de la descripción actual para no borrarla sin querer', () => {
    const datos = datosDe(categoria({ nombre: 'Malecon', descripcion: 'Borde del acantilado' }));
    expect(cuerpoDeCategoria(datos)).toEqual({
      nombre: 'Malecon',
      descripcion: 'Borde del acantilado',
    });
  });
});

describe('etiquetaDeActiva', () => {
  it('nombra el estado, no solo lo colorea', () => {
    expect(etiquetaDeActiva(true)).toBe('Activa');
    expect(etiquetaDeActiva(false)).toBe('Inactiva');
  });
});

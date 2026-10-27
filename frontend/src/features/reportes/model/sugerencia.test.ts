import { describe, expect, it } from 'vitest';
import {
  avisoDeFotoRechazada,
  sugerenciaDeRespuesta,
  vistaDeSugerencia,
  type CatalogoDelFormulario,
  type EstadoDeSugerencia,
} from './sugerencia';

const CATALOGO: CatalogoDelFormulario = {
  estado: 'listo',
  categorias: [
    { id: 1, nombre: 'Bache' },
    { id: 2, nombre: 'Pista deteriorada' },
    { id: 9, nombre: 'Vereda dañada' },
  ],
};

const lista = (categoriaId: number, categoriaNombre = 'Bache'): EstadoDeSugerencia => ({
  estado: 'lista',
  sugerencia: { categoriaId, categoriaNombre },
});

describe('sugerenciaDeRespuesta (NC-04)', () => {
  it('con los dos campos hay sugerencia', () => {
    expect(sugerenciaDeRespuesta({ categoriaId: 1, categoriaNombre: 'Bache' })).toEqual({
      categoriaId: 1,
      categoriaNombre: 'Bache',
    });
  });

  it.each([
    ['los dos nulos (contrato «sin sugerencia»)', { categoriaId: null, categoriaNombre: null }],
    ['solo el id', { categoriaId: 1, categoriaNombre: null }],
    ['solo el nombre', { categoriaId: null, categoriaNombre: 'Bache' }],
    ['nombre en blanco', { categoriaId: 1, categoriaNombre: '  ' }],
    ['cuerpo vacío (springdoc marca todo opcional)', {}],
  ])('%s: no hay sugerencia', (_caso, respuesta) => {
    expect(sugerenciaDeRespuesta(respuesta)).toBeNull();
  });

  it('una respuesta sin cuerpo no rompe', () => {
    expect(sugerenciaDeRespuesta(undefined)).toBeNull();
    expect(sugerenciaDeRespuesta(null)).toBeNull();
  });
});

describe('vistaDeSugerencia (NC-04)', () => {
  it('sin foto, o con la vista previa descartada, no muestra nada', () => {
    expect(vistaDeSugerencia({ estado: 'inactiva' }, CATALOGO, null)).toEqual({ tipo: 'oculta' });
  });

  it('la foto rechazada se avisa junto a la foto, no junto a la categoría', () => {
    const rechazada: EstadoDeSugerencia = { estado: 'foto-rechazada', mensaje: 'Formato…' };
    expect(vistaDeSugerencia(rechazada, CATALOGO, null)).toEqual({ tipo: 'oculta' });
  });

  it('mientras se analiza lo dice', () => {
    expect(vistaDeSugerencia({ estado: 'analizando' }, CATALOGO, 9)).toEqual({ tipo: 'analizando' });
  });

  it('sin sugerencia lo dice (también tras un fallo: la respuesta es la misma)', () => {
    const sinSugerencia: EstadoDeSugerencia = { estado: 'lista', sugerencia: null };
    expect(vistaDeSugerencia(sinSugerencia, CATALOGO, null)).toEqual({ tipo: 'sin-sugerencia' });
  });

  it('con el selector vacío la propone, sin darla por elegida', () => {
    expect(vistaDeSugerencia(lista(1), CATALOGO, null)).toEqual({
      tipo: 'sugerida',
      categoriaId: 1,
      nombre: 'Bache',
      yaElegida: false,
      seleccionable: true,
    });
  });

  it('si el ciudadano eligió otra, la propone igual y su elección no cambia', () => {
    const vista = vistaDeSugerencia(lista(1), CATALOGO, 9);
    expect(vista).toMatchObject({ tipo: 'sugerida', categoriaId: 1, yaElegida: false });
  });

  it('si el ciudadano ya tiene esa categoría, la marca como elegida', () => {
    expect(vistaDeSugerencia(lista(1), CATALOGO, 1)).toMatchObject({ yaElegida: true });
  });

  it('el nombre es el del selector, no el de la respuesta', () => {
    expect(vistaDeSugerencia(lista(2, 'pista deteriorada'), CATALOGO, null)).toMatchObject({
      nombre: 'Pista deteriorada',
    });
  });

  it('una sugerencia que no está en el catálogo se ignora (desfase de caché)', () => {
    expect(vistaDeSugerencia(lista(77), CATALOGO, null)).toEqual({ tipo: 'sin-sugerencia' });
  });

  it('con el catálogo cargando se sigue mostrando, pero sin poder elegirla todavía', () => {
    const cargando: CatalogoDelFormulario = { estado: 'cargando', categorias: [] };
    expect(vistaDeSugerencia(lista(1), cargando, 1)).toEqual({
      tipo: 'sugerida',
      categoriaId: 1,
      nombre: 'Bache',
      yaElegida: true,
      seleccionable: false,
    });
  });

  it('si el catálogo no se pudo traer, queda sin sugerencia (no hay cómo elegirla)', () => {
    const fallido: CatalogoDelFormulario = { estado: 'fallido', categorias: [] };
    expect(vistaDeSugerencia(lista(1), fallido, null)).toEqual({ tipo: 'sin-sugerencia' });
  });

  it('un catálogo cargado y vacío tampoco la deja en suspenso', () => {
    const vacio: CatalogoDelFormulario = { estado: 'listo', categorias: [] };
    expect(vistaDeSugerencia(lista(1), vacio, null)).toEqual({ tipo: 'sin-sugerencia' });
  });
});

describe('avisoDeFotoRechazada (NC-04)', () => {
  it('agrega qué hacer al motivo del backend, que llega sin punto final', () => {
    expect(avisoDeFotoRechazada('Formato de foto no permitido (usa JPG, PNG o WEBP)')).toBe(
      'Formato de foto no permitido (usa JPG, PNG o WEBP). Elige otra foto o quítala: con esta, el reporte no se podrá enviar.',
    );
  });

  it('no duplica el punto si el motivo ya lo trae', () => {
    expect(avisoDeFotoRechazada('La foto supera el máximo de 40 megapíxeles.')).toMatch(
      /^La foto supera el máximo de 40 megapíxeles\. Elige/,
    );
  });

  it('sin motivo usa uno genérico', () => {
    expect(avisoDeFotoRechazada('  ')).toMatch(/^La foto no es una imagen válida\. Elige/);
  });
});

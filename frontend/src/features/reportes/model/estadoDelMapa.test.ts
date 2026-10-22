import { describe, expect, it } from 'vitest';
import { FILTROS_VACIOS } from './bbox';
import {
  depurarFiltros,
  leerEstadoDelMapa,
  queryDelMapa,
  rutaDeRegresoAlMapa,
  rutaDelDetalle,
  rutaDelMapa,
} from './estadoDelMapa';

const leer = (query: string) => leerEstadoDelMapa(new URLSearchParams(query));

describe('leerEstadoDelMapa (QA-1 M-9)', () => {
  it('sin parámetros: sin filtros y en la vista Mapa', () => {
    expect(leer('')).toEqual({ filtros: FILTROS_VACIOS, vista: 'mapa' });
  });

  it('lee todos los filtros y la vista', () => {
    expect(leer('distrito=21&categoria=1&estado=RESUELTO&desde=2026-10-01&hasta=2026-10-05&vista=lista')).toEqual({
      filtros: {
        distritoId: 21,
        categoriaId: 1,
        estado: 'RESUELTO',
        fechaDesde: '2026-10-01',
        fechaHasta: '2026-10-05',
      },
      vista: 'lista',
    });
  });

  it('una URL editada a mano no rompe: lo inválido cuenta como «sin filtro»', () => {
    expect(leer('distrito=abc&categoria=-3&estado=BORRADO&desde=2026-02-31&hasta=ayer&vista=tabla')).toEqual({
      filtros: FILTROS_VACIOS,
      vista: 'mapa',
    });
    expect(leer('distrito=0&categoria=1.5').filtros).toEqual(FILTROS_VACIOS);
  });

  it('CANCELADO no es un filtro del mapa público', () => {
    expect(leer('estado=CANCELADO').filtros.estado).toBeNull();
  });
});

describe('queryDelMapa / rutaDelMapa', () => {
  it('sin nada que guardar, el mapa sigue siendo /mapa', () => {
    expect(queryDelMapa({ filtros: FILTROS_VACIOS, vista: 'mapa' })).toBe('');
    expect(rutaDelMapa({ filtros: FILTROS_VACIOS, vista: 'mapa' })).toBe('/mapa');
  });

  it('guarda solo lo que difiere del valor por defecto', () => {
    expect(rutaDelMapa({ filtros: { ...FILTROS_VACIOS, distritoId: 21 }, vista: 'lista' })).toBe(
      '/mapa?distrito=21&vista=lista',
    );
  });

  it('ida y vuelta: lo escrito se lee igual', () => {
    const estado = {
      filtros: {
        distritoId: 21,
        categoriaId: 1,
        estado: 'EN_PROCESO',
        fechaDesde: '2026-10-01',
        fechaHasta: '2026-10-05',
      },
      vista: 'lista' as const,
    };
    expect(leer(queryDelMapa(estado))).toEqual(estado);
  });
});

describe('depurarFiltros', () => {
  const filtros = { ...FILTROS_VACIOS, distritoId: 99, categoriaId: 1 };

  it('descarta los ids que el catálogo no conoce', () => {
    expect(depurarFiltros(filtros, [21, 17], [1, 2])).toEqual({ ...filtros, distritoId: null });
    expect(depurarFiltros(filtros, [99], [2])).toEqual({ ...filtros, categoriaId: null });
  });

  it('con el catálogo sin cargar (null) no toca esa parte', () => {
    expect(depurarFiltros(filtros, null, null)).toBe(filtros);
  });

  it('si no hay nada que quitar devuelve el mismo objeto (identidad estable para el debounce)', () => {
    expect(depurarFiltros(filtros, [99], [1])).toBe(filtros);
  });
});

describe('rutaDeRegresoAlMapa', () => {
  it('vuelve a la vista filtrada de la que se vino', () => {
    expect(rutaDeRegresoAlMapa('/mapa?distrito=21&vista=lista')).toBe('/mapa?distrito=21&vista=lista');
  });

  it('sin parámetro, al mapa a secas', () => {
    expect(rutaDeRegresoAlMapa(null)).toBe('/mapa');
    expect(rutaDeRegresoAlMapa('')).toBe('/mapa');
  });

  it('solo lleva al mapa: ni a otro sitio ni a otra pantalla', () => {
    expect(rutaDeRegresoAlMapa('https://otro.example/mapa')).toBe('/mapa');
    expect(rutaDeRegresoAlMapa('//otro.example/mapa')).toBe('/mapa');
    expect(rutaDeRegresoAlMapa('/\t/otro.example')).toBe('/mapa');
    expect(rutaDeRegresoAlMapa('/bandeja')).toBe('/mapa');
    expect(rutaDeRegresoAlMapa('/mapas-falsos')).toBe('/mapa');
  });
});

describe('rutaDelDetalle', () => {
  it('lleva la vista del mapa en ?volver= solo si hay algo que recordar', () => {
    expect(rutaDelDetalle(7, '/mapa')).toBe('/reportes/7');
    expect(rutaDelDetalle(7, '/mapa?distrito=21&vista=lista')).toBe(
      '/reportes/7?volver=%2Fmapa%3Fdistrito%3D21%26vista%3Dlista',
    );
  });
});

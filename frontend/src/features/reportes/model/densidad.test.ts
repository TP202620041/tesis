import { describe, expect, it } from 'vitest';
import { finDelDiaLocal, inicioDelDiaLocal } from '@/lib/types/fechas';
import { FILTROS_VACIOS, construirQuery, type BoundingBox } from './bbox';
import {
  NIVELES_CALOR,
  capaDeCalor,
  celdaEnArea,
  consultaDeDensidad,
  construirQueryDensidad,
  estiloDeNivel,
  ladoDeCeldaEnMetros,
  nivelDeCalor,
  rangoDeNivel,
  textoDeRango,
} from './densidad';
import type { DensidadReportes } from './tipos';

const AREA: BoundingBox = { minLat: -12.13, minLon: -77.04, maxLat: -12.11, maxLon: -77.02 };

function densidad(celdas: DensidadReportes['celdas']): DensidadReportes {
  return {
    celdaGrados: 0.001,
    totalReportes: celdas.reduce((s, c) => s + c.cantidad, 0),
    celdas,
  };
}

describe('construirQueryDensidad', () => {
  it('sin filtros es vacía: ni área ni tamaño de página', () => {
    expect(construirQueryDensidad(FILTROS_VACIOS)).toBe('');
  });

  it('lleva los mismos filtros que la búsqueda de marcadores', () => {
    const filtros = {
      distritoId: 21,
      categoriaId: 3,
      estado: 'RESUELTO',
      fechaDesde: '2026-10-01',
      fechaHasta: '2026-10-05',
    };
    const densidadQ = new URLSearchParams(construirQueryDensidad(filtros));
    const busqueda = new URLSearchParams(construirQuery(AREA, filtros, 300));
    for (const clave of ['distritoId', 'categoriaId', 'estado', 'fechaDesde', 'fechaHasta']) {
      expect(densidadQ.get(clave)).toBe(busqueda.get(clave));
    }
    expect(densidadQ.get('fechaDesde')).toBe(inicioDelDiaLocal('2026-10-01'));
    expect(densidadQ.get('fechaHasta')).toBe(finDelDiaLocal('2026-10-05'));
    for (const clave of ['minLat', 'minLon', 'maxLat', 'maxLon', 'size']) {
      expect(densidadQ.has(clave)).toBe(false);
    }
  });
});

describe('consultaDeDensidad', () => {
  it('no consulta con el rango de fechas invertido', () => {
    expect(
      consultaDeDensidad({ ...FILTROS_VACIOS, fechaDesde: '2026-10-06', fechaHasta: '2026-10-05' }),
    ).toBeNull();
  });

  it('solo cambia si cambian los filtros (el área no participa)', () => {
    const a = consultaDeDensidad({ ...FILTROS_VACIOS, categoriaId: 2 });
    const b = consultaDeDensidad({ ...FILTROS_VACIOS, categoriaId: 2 });
    const c = consultaDeDensidad({ ...FILTROS_VACIOS, categoriaId: 3 });
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });
});

describe('nivelDeCalor', () => {
  it('reparte en cuartiles del máximo, redondeando hacia arriba', () => {
    expect(nivelDeCalor(1, 8)).toBe(1);
    expect(nivelDeCalor(2, 8)).toBe(1);
    expect(nivelDeCalor(3, 8)).toBe(2);
    expect(nivelDeCalor(4, 8)).toBe(2);
    expect(nivelDeCalor(6, 8)).toBe(3);
    expect(nivelDeCalor(7, 8)).toBe(4);
    expect(nivelDeCalor(8, 8)).toBe(4);
  });

  it('la celda más cargada siempre es el nivel máximo, aunque tenga un solo reporte', () => {
    expect(nivelDeCalor(1, 1)).toBe(4);
  });

  it('no se sale del rango con valores fuera de lo esperado', () => {
    expect(nivelDeCalor(0, 5)).toBe(1);
    expect(nivelDeCalor(3, 0)).toBe(1);
    expect(nivelDeCalor(9, 5)).toBe(4);
  });
});

describe('rangoDeNivel', () => {
  it('es la inversa de nivelDeCalor para todo máximo', () => {
    for (let maximo = 1; maximo <= 40; maximo++) {
      for (let cantidad = 1; cantidad <= maximo; cantidad++) {
        const rango = rangoDeNivel(nivelDeCalor(cantidad, maximo), maximo);
        expect(rango).not.toBeNull();
        expect(cantidad).toBeGreaterThanOrEqual(rango!.desde);
        expect(cantidad).toBeLessThanOrEqual(rango!.hasta);
      }
    }
  });

  it('deja vacíos los niveles a los que no llega ninguna cantidad', () => {
    expect(rangoDeNivel(1, 1)).toBeNull();
    expect(rangoDeNivel(4, 1)).toEqual({ desde: 1, hasta: 1 });
    expect(rangoDeNivel(1, 0)).toBeNull();
  });

  it('con máximo 10 da 1–2, 3–5, 6–7 y 8–10', () => {
    expect(rangoDeNivel(1, 10)).toEqual({ desde: 1, hasta: 2 });
    expect(rangoDeNivel(2, 10)).toEqual({ desde: 3, hasta: 5 });
    expect(rangoDeNivel(3, 10)).toEqual({ desde: 6, hasta: 7 });
    expect(rangoDeNivel(4, 10)).toEqual({ desde: 8, hasta: 10 });
  });
});

describe('textoDeRango', () => {
  it('nombra la cantidad con singular y plural', () => {
    expect(textoDeRango(1, 1)).toBe('1 reporte');
    expect(textoDeRango(3, 3)).toBe('3 reportes');
    expect(textoDeRango(2, 4)).toBe('2 a 4 reportes');
  });
});

describe('estilos de nivel', () => {
  it('cada nivel tiene etiqueta, color propio y un radio mayor que el anterior', () => {
    expect(NIVELES_CALOR.map((n) => n.nivel)).toEqual([1, 2, 3, 4]);
    expect(new Set(NIVELES_CALOR.map((n) => n.color)).size).toBe(4);
    for (let i = 1; i < NIVELES_CALOR.length; i++) {
      expect(NIVELES_CALOR[i]!.radio).toBeGreaterThan(NIVELES_CALOR[i - 1]!.radio);
    }
    expect(estiloDeNivel(4).etiqueta).toBe('Muy alta');
  });
});

describe('celdaEnArea', () => {
  it('incluye las celdas cortadas por el borde (media celda de margen)', () => {
    expect(celdaEnArea({ latitud: -12.12, longitud: -77.03, cantidad: 1 }, AREA, 0.001)).toBe(true);
    expect(celdaEnArea({ latitud: -12.1304, longitud: -77.03, cantidad: 1 }, AREA, 0.001)).toBe(true);
    expect(celdaEnArea({ latitud: -12.132, longitud: -77.03, cantidad: 1 }, AREA, 0.001)).toBe(false);
    expect(celdaEnArea({ latitud: -12.12, longitud: -77.0, cantidad: 1 }, AREA, 0.001)).toBe(false);
  });
});

describe('capaDeCalor', () => {
  const DENTRO_GRANDE = { latitud: -12.12, longitud: -77.03, cantidad: 4 };
  const DENTRO_CHICA = { latitud: -12.115, longitud: -77.025, cantidad: 1 };
  const FUERA = { latitud: -12.05, longitud: -77.0, cantidad: 40 };

  it('la escala es relativa al máximo de la vista, no al de toda Lima', () => {
    const capa = capaDeCalor(densidad([FUERA, DENTRO_GRANDE, DENTRO_CHICA]), AREA);
    expect(capa.maximo).toBe(4);
    expect(capa.totalEnVista).toBe(5);
    expect(capa.celdas.map((c) => c.cantidad)).toEqual([1, 4]);
    expect(capa.celdas.find((c) => c.cantidad === 4)?.nivel).toBe(4);
    expect(capa.celdas.find((c) => c.cantidad === 1)?.nivel).toBe(1);
    expect(capa.celdas.find((c) => c.cantidad === 1)?.intensidad).toBe(0.25);
  });

  it('ordena de menor a mayor para dibujar encima las más cargadas', () => {
    const capa = capaDeCalor(densidad([DENTRO_GRANDE, DENTRO_CHICA]), null);
    expect(capa.celdas.map((c) => c.cantidad)).toEqual([1, 4]);
  });

  it('sin área usa toda la grilla', () => {
    const capa = capaDeCalor(densidad([FUERA, DENTRO_GRANDE]), null);
    expect(capa.maximo).toBe(40);
    expect(capa.celdas).toHaveLength(2);
  });

  it('la leyenda solo trae los niveles posibles, con su texto', () => {
    const capa = capaDeCalor(densidad([DENTRO_GRANDE, DENTRO_CHICA]), AREA);
    expect(capa.leyenda.map((n) => [n.etiqueta, n.texto])).toEqual([
      ['Baja', '1 reporte'],
      ['Media', '2 reportes'],
      ['Alta', '3 reportes'],
      ['Muy alta', '4 reportes'],
    ]);
  });

  it('sin celdas visibles queda vacía y sin leyenda', () => {
    const capa = capaDeCalor(densidad([FUERA]), AREA);
    expect(capa).toEqual({ celdas: [], maximo: 0, totalEnVista: 0, leyenda: [] });
  });
});

describe('ladoDeCeldaEnMetros', () => {
  it('0.001° son unos 110 m', () => {
    expect(ladoDeCeldaEnMetros(0.001)).toBe(110);
  });
});

import { describe, expect, it } from 'vitest';
import { ESTADOS_EN_MAPA, estiloDeEstado } from './estados';
import { ESTADOS_REPORTE } from '@/lib/types/domain';

describe('estiloDeEstado', () => {
  it('da etiqueta y color a cada estado del backend', () => {
    // Recorre el enum real: si el backend agrega un estado y aquí no se
    // define, este test lo delata en vez de dejar marcadores grises.
    for (const estado of ESTADOS_REPORTE) {
      const estilo = estiloDeEstado(estado);
      expect(estilo.etiqueta).not.toBe('Desconocido');
      expect(estilo.color).toMatch(/^#[0-9a-f]{6}$/i);
      expect(estilo.descripcion.length).toBeGreaterThan(0);
    }
  });

  it('asigna un color distinto a cada estado visible en el mapa', () => {
    // El color es el único canal que distingue un marcador de otro: dos
    // estados con el mismo color harían la leyenda inútil.
    const colores = ESTADOS_EN_MAPA.map((e) => estiloDeEstado(e).color);
    expect(new Set(colores).size).toBe(ESTADOS_EN_MAPA.length);
  });

  it('degrada a un estilo neutro ante un estado desconocido', () => {
    // `estado` llega como string del API; un valor nuevo no debe romper.
    const estilo = estiloDeEstado('ALGO_NUEVO');
    expect(estilo.etiqueta).toBe('Desconocido');
    expect(estilo.color).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it('tolera un estado vacío', () => {
    expect(() => estiloDeEstado('')).not.toThrow();
  });
});

describe('ESTADOS_EN_MAPA', () => {
  it('excluye CANCELADO', () => {
    // Un CANCELADO lo retiró el propio ciudadano estando PENDIENTE: el
    // backend ya no lo devuelve salvo que se pida, así que ofrecerlo como
    // filtro daría siempre cero resultados.
    expect(ESTADOS_EN_MAPA).not.toContain('CANCELADO');
  });

  it('incluye RECHAZADO', () => {
    // A diferencia de CANCELADO, aquí decidió la municipalidad y esa
    // decisión es información pública de transparencia.
    expect(ESTADOS_EN_MAPA).toContain('RECHAZADO');
  });

  it('cubre todos los estados salvo CANCELADO', () => {
    const esperados = ESTADOS_REPORTE.filter((e) => e !== 'CANCELADO');
    expect([...ESTADOS_EN_MAPA].sort()).toEqual([...esperados].sort());
  });
});

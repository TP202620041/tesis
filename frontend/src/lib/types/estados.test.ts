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

  it('DIS-1: distingue cada estado por color, icono y nombre, no solo por color', () => {
    const estilos = ESTADOS_REPORTE.map(estiloDeEstado);
    expect(new Set(estilos.map((e) => e.icono)).size).toBe(ESTADOS_REPORTE.length);
    expect(new Set(estilos.map((e) => e.etiqueta)).size).toBe(ESTADOS_REPORTE.length);
    expect(new Set(estilos.map((e) => e.clave)).size).toBe(ESTADOS_REPORTE.length);
  });

  it('DIS-1: Recibido es azul y En proceso lleva glifo oscuro (propuesta §4)', () => {
    expect(estiloDeEstado('RECIBIDO').color).toBe('#2e6be6');
    expect(estiloDeEstado('RECIBIDO').icono).toBe('bandeja');
    expect(estiloDeEstado('EN_PROCESO').glifo).toBe('#1a1a1a');
  });

  it('el glifo sobre el marcador tiene contraste de texto (4.5:1)', () => {
    const lum = (hex: string) => {
      const [r, g, b] = [1, 3, 5]
        .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
        .map((x) => (x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
      return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
    };
    for (const estado of ESTADOS_EN_MAPA) {
      const { color, glifo } = estiloDeEstado(estado);
      const [a, b] = [lum(color), lum(glifo)].sort((x, y) => y - x);
      expect((a! + 0.05) / (b! + 0.05), estado).toBeGreaterThanOrEqual(4.5);
    }
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

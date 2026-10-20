import { describe, expect, it } from 'vitest';
import { paginar, TAMANO_PAGINA_LISTA } from './paginacion';

const numeros = (n: number) => Array.from({ length: n }, (_, i) => i + 1);

describe('paginar', () => {
  it('devuelve la primera página con su rango', () => {
    const p = paginar(numeros(45), 0, 20);
    expect(p.elementos).toEqual(numeros(20));
    expect(p).toMatchObject({ pagina: 0, totalPaginas: 3, desde: 1, hasta: 20, total: 45 });
  });

  it('la última página puede venir incompleta', () => {
    const p = paginar(numeros(45), 2, 20);
    expect(p.elementos).toEqual([41, 42, 43, 44, 45]);
    expect(p).toMatchObject({ pagina: 2, desde: 41, hasta: 45 });
  });

  it('acota una página que ya no existe a la última disponible', () => {
    // Pasa al aplicar un filtro estando en la página 3: no debe quedar vacía.
    const p = paginar(numeros(25), 5, 20);
    expect(p.pagina).toBe(1);
    expect(p.elementos).toEqual([21, 22, 23, 24, 25]);
  });

  it('acota páginas negativas o no numéricas a la primera', () => {
    expect(paginar(numeros(5), -1, 20).pagina).toBe(0);
    expect(paginar(numeros(5), Number.NaN, 20).pagina).toBe(0);
  });

  it('sin elementos hay una sola página vacía', () => {
    expect(paginar([], 0, 20)).toEqual({
      elementos: [],
      pagina: 0,
      totalPaginas: 1,
      desde: 0,
      hasta: 0,
      total: 0,
    });
  });

  it('usa 20 por página por defecto', () => {
    expect(TAMANO_PAGINA_LISTA).toBe(20);
    expect(paginar(numeros(21), 0).totalPaginas).toBe(2);
  });
});

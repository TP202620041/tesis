import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { ICONOS_CATEGORIA } from '@/lib/types/iconoCategoria';
import {
  IconoDeCategoria,
  PICTOGRAMA_DE_ICONO,
  PICTOGRAMA_GENERICO,
  pictogramaDeCategoria,
} from './IconoDeCategoria';

describe('IconoDeCategoria (US-29 / US-34)', () => {
  it('cada valor del enum tiene un pictograma propio, distinto del genérico', () => {
    const pictogramas = ICONOS_CATEGORIA.map((v) => PICTOGRAMA_DE_ICONO[v]);
    expect(new Set(pictogramas).size).toBe(ICONOS_CATEGORIA.length);
    expect(pictogramas).not.toContain(PICTOGRAMA_GENERICO);
  });

  it('sin ícono o con uno desconocido usa el genérico', () => {
    expect(pictogramaDeCategoria(null)).toBe(PICTOGRAMA_GENERICO);
    expect(pictogramaDeCategoria('COHETE')).toBe(PICTOGRAMA_GENERICO);
    expect(pictogramaDeCategoria('CICLOVIA')).toBe(PICTOGRAMA_DE_ICONO.CICLOVIA);
  });

  it('es decorativo: el nombre de la categoría lleva el sentido', () => {
    const { container } = render(<IconoDeCategoria icono="CICLOVIA" />);
    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(svg).toHaveClass('lucide-bike');
  });
});

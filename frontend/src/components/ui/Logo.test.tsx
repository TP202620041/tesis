import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Logo } from './Logo';

describe('Logo', () => {
  it('con el nombre visible, el símbolo es decorativo', () => {
    const { container } = render(<Logo conNombre />);
    expect(screen.getByText('Ciudad Viva')).toBeInTheDocument();
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });

  it('sin nombre visible, puede llevar su nombre accesible', () => {
    render(<Logo etiqueta="Ciudad Viva" />);
    expect(screen.getByRole('img', { name: 'Ciudad Viva' })).toBeInTheDocument();
  });

  it('cada logo recorta la calle con su propio clipPath', () => {
    // Dos logos en la misma página (cabecera y menú) no pueden compartir id.
    const { container } = render(
      <>
        <Logo />
        <Logo />
      </>,
    );
    const ids = [...container.querySelectorAll('clipPath')].map((c) => c.id);
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
    for (const id of ids) {
      expect(container.querySelector(`g[clip-path="url(#${id})"]`)).not.toBeNull();
    }
  });

  it('toma los colores del tema, no un color fijo', () => {
    const { container } = render(<Logo />);
    const pin = container.querySelector('svg > path') as SVGPathElement;
    expect(pin.style.fill).toBe('var(--cv-marca)');
  });
});

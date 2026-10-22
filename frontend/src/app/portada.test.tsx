import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import Home from './page';

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => <a href={href}>{children}</a>,
}));

describe('Portada', () => {
  it('ofrece las vistas públicas sin pedir cuenta', () => {
    render(<Home />);
    expect(screen.getByRole('link', { name: 'Ver el mapa de reportes' })).toHaveAttribute('href', '/mapa');
    expect(screen.getByRole('link', { name: 'Desempeño por distrito' })).toHaveAttribute('href', '/desempeno');
  });

  it('QA-1 E-3: enlaza a los términos de uso y la privacidad', () => {
    render(<Home />);
    expect(screen.getByRole('link', { name: 'Términos de uso y privacidad' })).toHaveAttribute(
      'href',
      '/privacidad',
    );
  });
});

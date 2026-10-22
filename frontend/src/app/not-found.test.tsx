import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import NoEncontrada, { metadata } from './not-found';

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => <a href={href}>{children}</a>,
}));

describe('404 (QA-1 M-11)', () => {
  it('en castellano, con título propio y enlace a la portada', () => {
    render(<NoEncontrada />);
    expect(screen.getByRole('heading', { name: 'Página no encontrada' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ir a la portada' })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: 'Ver el mapa de reportes' })).toHaveAttribute('href', '/mapa');
    expect(screen.queryByText(/could not be found/i)).not.toBeInTheDocument();
    expect(metadata.title).toBe('Página no encontrada');
  });
});

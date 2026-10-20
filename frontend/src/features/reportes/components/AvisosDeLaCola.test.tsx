import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AvisoPendientesSinSesion } from './AvisosDeLaCola';

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => <a href={href}>{children}</a>,
}));

describe('AvisoPendientesSinSesion', () => {
  it('avisa sin bloquear y enlaza al login con la ruta actual de vuelta', () => {
    render(<AvisoPendientesSinSesion cantidad={2} ruta="/mapa" />);

    expect(screen.getByRole('status')).toHaveTextContent(
      'Tienes 2 reportes pendientes de envío: inicia sesión para enviarlos.',
    );
    expect(screen.getByRole('link', { name: 'inicia sesión para enviarlos' })).toHaveAttribute(
      'href',
      '/login?redirect=%2Fmapa',
    );
  });

  it('no aparece en el login ni sin pendientes', () => {
    const { container, rerender } = render(<AvisoPendientesSinSesion cantidad={1} ruta="/login" />);
    expect(container).toBeEmptyDOMElement();

    rerender(<AvisoPendientesSinSesion cantidad={0} ruta="/mapa" />);
    expect(container).toBeEmptyDOMElement();
  });
});

import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EnlaceDeAcceso } from './EnlaceDeAcceso';

const { parametros } = vi.hoisted(() => ({ parametros: { valor: new URLSearchParams() } }));
vi.mock('next/navigation', () => ({ useSearchParams: () => parametros.valor }));
vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => <a href={href}>{children}</a>,
}));

describe('EnlaceDeAcceso (QA-1 I-2)', () => {
  it('lleva el ?redirect= del login al registro', () => {
    parametros.valor = new URLSearchParams('redirect=/reportar');
    render(<EnlaceDeAcceso ruta="/registro">Regístrate</EnlaceDeAcceso>);
    expect(screen.getByRole('link', { name: 'Regístrate' })).toHaveAttribute(
      'href',
      '/registro?redirect=%2Freportar',
    );
  });

  it('sin redirect, o con uno externo, enlaza a la ruta a secas', () => {
    parametros.valor = new URLSearchParams('redirect=//otro.example');
    render(<EnlaceDeAcceso ruta="/login">Inicia sesión</EnlaceDeAcceso>);
    expect(screen.getByRole('link', { name: 'Inicia sesión' })).toHaveAttribute('href', '/login');
  });
});

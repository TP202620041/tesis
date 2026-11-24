import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { CategoriaDano } from '@/lib/types/domain';
import { AyudaDeCategorias } from './AyudaDeCategorias';

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => <a href={href}>{children}</a>,
}));

const CATEGORIAS: CategoriaDano[] = [
  { id: 1, nombre: 'Bache', descripcion: 'Bache o hueco en la calzada', esEstandar: true },
  { id: 9, nombre: 'Buzón sin tapa', esEstandar: false },
];

const boton = () => screen.getByRole('button', { name: 'Ayuda: qué tipo de daño elegir' });

describe('AyudaDeCategorias (US-24 Esc. 2)', () => {
  it('cerrada por defecto; el «?» la despliega con cada tipo y su descripción', async () => {
    const usuario = userEvent.setup();
    render(<AyudaDeCategorias categorias={CATEGORIAS} />);
    expect(boton()).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Bache o hueco en la calzada')).not.toBeInTheDocument();

    await usuario.click(boton());

    expect(boton()).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('region', { name: '¿Qué tipo de daño elijo?' })).toBeInTheDocument();
    expect(screen.getByText('Bache')).toBeInTheDocument();
    expect(screen.getByText('Bache o hueco en la calzada')).toBeInTheDocument();
    // Una categoría sin descripción no queda en blanco.
    expect(screen.getByText('Sin descripción.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ver la guía' })).toHaveAttribute('href', '/como-funciona');
  });

  it('Escape la cierra y devuelve el foco al «?»', async () => {
    const usuario = userEvent.setup();
    render(<AyudaDeCategorias categorias={CATEGORIAS} />);
    await usuario.click(boton());

    await usuario.keyboard('{Escape}');

    expect(boton()).toHaveAttribute('aria-expanded', 'false');
    expect(boton()).toHaveFocus();
  });

  it('su X la cierra', async () => {
    const usuario = userEvent.setup();
    render(<AyudaDeCategorias categorias={CATEGORIAS} />);
    await usuario.click(boton());

    await usuario.click(screen.getByRole('button', { name: 'Cerrar la ayuda' }));

    expect(screen.queryByText('Bache o hueco en la calzada')).not.toBeInTheDocument();
    expect(boton()).toHaveFocus();
  });
});

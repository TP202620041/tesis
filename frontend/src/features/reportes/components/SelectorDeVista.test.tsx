import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SelectorDeVista } from './SelectorDeVista';

describe('SelectorDeVista', () => {
  it('marca la vista activa con aria-pressed dentro de un grupo con nombre', () => {
    render(<SelectorDeVista vista="mapa" onElegir={vi.fn()} />);
    expect(screen.getByRole('group', { name: 'Vista de resultados' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mapa' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Lista' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('elige la otra vista con el ratón', async () => {
    const onElegir = vi.fn();
    render(<SelectorDeVista vista="mapa" onElegir={onElegir} />);
    await userEvent.click(screen.getByRole('button', { name: 'Lista' }));
    expect(onElegir).toHaveBeenCalledWith('lista');
  });

  it('se usa con el teclado: Tab llega a cada botón y Enter o Espacio lo activan', async () => {
    const onElegir = vi.fn();
    render(<SelectorDeVista vista="lista" onElegir={onElegir} />);

    await userEvent.tab();
    expect(screen.getByRole('button', { name: 'Mapa' })).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    expect(onElegir).toHaveBeenLastCalledWith('mapa');

    await userEvent.tab();
    expect(screen.getByRole('button', { name: 'Lista' })).toHaveFocus();
    await userEvent.keyboard(' ');
    expect(onElegir).toHaveBeenLastCalledWith('lista');
  });
});

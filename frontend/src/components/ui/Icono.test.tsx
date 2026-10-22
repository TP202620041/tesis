import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Inbox, X } from 'lucide-react';
import { BotonIcono, Icono } from './Icono';

describe('Icono', () => {
  it('es decorativo: oculto para el lector de pantalla', () => {
    const { container } = render(
      <p>
        <Icono icono={Inbox} /> Recibido
      </p>,
    );
    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(svg).toHaveAttribute('focusable', 'false');
    // El nombre lo da el texto, no el icono.
    expect(screen.getByText('Recibido')).toBeInTheDocument();
  });
});

describe('BotonIcono', () => {
  it('lleva su nombre accesible aunque no tenga texto visible', async () => {
    const alPulsar = vi.fn();
    render(<BotonIcono icono={X} etiqueta="Cerrar aviso" onClick={alPulsar} />);
    const boton = screen.getByRole('button', { name: 'Cerrar aviso' });
    expect(boton).toHaveAttribute('type', 'button');
    expect(boton.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    await userEvent.click(boton);
    expect(alPulsar).toHaveBeenCalledOnce();
  });
});

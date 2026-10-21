import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CampoSeveridad, CampoTitulo } from './CamposTituloYSeveridad';

const contador = () => screen.getByText(/caracteres \(/);

describe('CampoTitulo (NC-02)', () => {
  it('sin error no marca nada; el contador cuenta code points', () => {
    render(<CampoTitulo id="t" valor="Hoyo😀" onCambiar={vi.fn()} />);
    expect(screen.getByLabelText('Título')).not.toHaveAttribute('aria-invalid');
    expect(screen.getByLabelText('Título')).toHaveAttribute('aria-describedby', 't-ayuda');
    expect(contador()).toHaveTextContent('(5/120)');
    expect(contador()).not.toHaveAttribute('data-fuera-de-rango');
  });

  it('el contador se marca con menos de 5 y con más de 120, pero no vacío y sin error', () => {
    const { rerender } = render(<CampoTitulo id="t" valor="" onCambiar={vi.fn()} />);
    expect(contador()).not.toHaveAttribute('data-fuera-de-rango');

    rerender(<CampoTitulo id="t" valor="Hoyo" onCambiar={vi.fn()} />);
    expect(contador()).toHaveAttribute('data-fuera-de-rango', 'true');

    rerender(<CampoTitulo id="t" valor={'x'.repeat(121)} onCambiar={vi.fn()} />);
    expect(contador()).toHaveAttribute('data-fuera-de-rango', 'true');

    rerender(<CampoTitulo id="t" valor="" onCambiar={vi.fn()} error="Escribe un título para el reporte." />);
    expect(contador()).toHaveAttribute('data-fuera-de-rango', 'true');
  });

  it('con error: aria-invalid y aria-describedby con el id del mensaje', () => {
    render(<CampoTitulo id="t" valor="Ab" onCambiar={vi.fn()} error="Muy corto" />);
    const input = screen.getByLabelText('Título');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input.getAttribute('aria-describedby')?.split(' ')).toEqual(['t-error', 't-ayuda']);
    expect(screen.getByRole('alert')).toHaveAttribute('id', 't-error');
  });
});

describe('CampoSeveridad (NC-02)', () => {
  it('con error marca el grupo y lo describe con el mensaje', () => {
    render(<CampoSeveridad nombre="s" valor={null} onCambiar={vi.fn()} error="Elige la severidad del daño." />);
    const grupo = screen.getByRole('group', { name: 'Severidad' });
    expect(grupo).toHaveAttribute('aria-invalid', 'true');
    expect(grupo.getAttribute('aria-describedby')?.split(' ')).toContain('s-error');
    expect(screen.getByRole('alert')).toHaveAttribute('id', 's-error');
  });

  it('sin error no marca el grupo', () => {
    render(<CampoSeveridad nombre="s" valor="MEDIA" onCambiar={vi.fn()} />);
    expect(screen.getByRole('group', { name: 'Severidad' })).not.toHaveAttribute('aria-invalid');
    expect(screen.getByRole('radio', { name: 'Media' })).toBeChecked();
  });
});

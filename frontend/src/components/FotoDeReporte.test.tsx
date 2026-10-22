import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { FotoDeReporte } from './FotoDeReporte';

const URL_FOTO = 'http://localhost:8080/media/fotos/reportes/a.png';

describe('FotoDeReporte (QA-1 M-3)', () => {
  it('muestra la foto mientras carga bien', () => {
    render(<FotoDeReporte src={URL_FOTO} alt="Foto del daño reportado: Bache" />);
    expect(screen.getByRole('img', { name: 'Foto del daño reportado: Bache' })).toHaveAttribute('src', URL_FOTO);
    expect(screen.queryByText('Foto no disponible')).not.toBeInTheDocument();
  });

  it('si la foto no carga, un reemplazo neutro que conserva el texto alternativo', () => {
    render(<FotoDeReporte src={URL_FOTO} alt="Foto del daño reportado: Bache" />);
    fireEvent.error(screen.getByRole('img'));

    expect(screen.getByText('Foto no disponible')).toBeInTheDocument();
    expect(
      screen.getByRole('img', { name: 'Foto del daño reportado: Bache (foto no disponible)' }),
    ).not.toHaveAttribute('src');
  });

  it('una foto decorativa rota sigue siendo decorativa', () => {
    const { container } = render(<FotoDeReporte src={URL_FOTO} alt="" />);
    fireEvent.error(container.querySelector('img')!);

    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true');
  });

  it('vuelve a intentar si cambia la URL', () => {
    const { rerender } = render(<FotoDeReporte src={URL_FOTO} alt="Foto" />);
    fireEvent.error(screen.getByRole('img'));
    expect(screen.getByText('Foto no disponible')).toBeInTheDocument();

    rerender(<FotoDeReporte src={`${URL_FOTO}?v=2`} alt="Foto" />);
    expect(screen.getByRole('img', { name: 'Foto' })).toHaveAttribute('src', `${URL_FOTO}?v=2`);
  });
});

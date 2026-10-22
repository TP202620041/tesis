import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CampoFoto } from './CampoFoto';

const MB = 1024 * 1024;

/** Un `File` que dice pesar `bytes` sin reservarlos. */
function archivo(nombre: string, tipo: string, bytes = 2 * MB): File {
  const f = new File(['x'], nombre, { type: tipo });
  Object.defineProperty(f, 'size', { value: bytes });
  return f;
}

// `applyAccept: false`: el selector del sistema deja elegir «Todos los
// archivos», así que el `accept` no basta y la regla tiene que atajarlo.
const montar = () => {
  const onCambiar = vi.fn();
  const usuario = userEvent.setup({ applyAccept: false });
  render(<CampoFoto valor={null} onCambiar={onCambiar} />);
  return { onCambiar, usuario, input: screen.getByLabelText('Foto del daño (opcional)') };
};

describe('CampoFoto (US-05, DEP-11)', () => {
  it('el selector tiene nombre, acepta solo JPG, PNG y WEBP y dice el límite', () => {
    const { input } = montar();
    expect(input).toHaveAttribute('accept', 'image/jpeg,image/png,image/webp');
    expect(input).toHaveAccessibleDescription('JPG, PNG o WEBP, de hasta 10 MB.');
    expect(input).not.toHaveAttribute('aria-invalid');
  });

  it('una foto válida pasa al formulario', async () => {
    const { onCambiar, usuario, input } = montar();
    const foto = archivo('bache.jpg', 'image/jpeg', 10 * MB);

    await usuario.upload(input, foto);

    expect(onCambiar).toHaveBeenCalledWith(foto);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('más de 10 MB: no pasa al formulario y el motivo queda asociado al campo', async () => {
    const { onCambiar, usuario, input } = montar();

    await usuario.upload(input, archivo('bache.jpg', 'image/jpeg', 10 * MB + 1));

    const alerta = screen.getByRole('alert');
    expect(alerta).toHaveTextContent('La foto supera 10 MB.');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input.getAttribute('aria-describedby')).toContain(alerta.id);
    expect(screen.getByRole('button', { name: 'Tomar o elegir una foto' })).toHaveAccessibleDescription(
      'La foto supera 10 MB. JPG, PNG o WEBP, de hasta 10 MB.',
    );
    expect(onCambiar).not.toHaveBeenCalled();
  });

  it('otro formato: el mismo aviso que antes y no pasa al formulario', async () => {
    const { onCambiar, usuario } = montar();

    await usuario.upload(
      screen.getByLabelText('Foto del daño (opcional)'),
      archivo('IMG_0042.HEIC', 'image/heic'),
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Formato no permitido. Usa JPG, PNG o WEBP.');
    expect(onCambiar).not.toHaveBeenCalled();
  });

  it('elegir después una foto válida borra el aviso', async () => {
    const { onCambiar, usuario, input } = montar();
    await usuario.upload(input, archivo('bache.jpg', 'image/jpeg', 12 * MB));
    expect(screen.getByRole('alert')).toBeInTheDocument();

    const buena = archivo('bache.png', 'image/png');
    await usuario.upload(input, buena);

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(input).not.toHaveAttribute('aria-invalid');
    expect(onCambiar).toHaveBeenCalledWith(buena);
  });
});

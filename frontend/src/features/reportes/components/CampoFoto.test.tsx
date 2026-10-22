import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
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

describe('CampoFoto con una foto ya elegida (DEP-11)', () => {
  beforeEach(() => {
    // jsdom no implementa las URL `blob:` de la vista previa.
    Object.assign(URL, {
      createObjectURL: vi.fn(() => 'blob:vista-previa'),
      revokeObjectURL: vi.fn(),
    });
  });

  afterEach(() => {
    // Primero se desmonta: la limpieza de la vista previa llama a
    // `revokeObjectURL`, y el `cleanup` de vitest.setup corre DESPUES de este
    // afterEach (los `after` van en orden inverso).
    cleanup();
    // Se quitan para no dejar el global de jsdom modificado en otros archivos.
    const urlMutable = URL as unknown as Record<string, unknown>;
    delete urlMutable.createObjectURL;
    delete urlMutable.revokeObjectURL;
  });

  /** El campo con su estado, como en el formulario. */
  function ConEstado({ alCambiar }: { alCambiar: (foto: File | null) => void }) {
    const [foto, setFoto] = useState<File | null>(null);
    return (
      <CampoFoto
        valor={foto}
        onCambiar={(f) => {
          setFoto(f);
          alCambiar(f);
        }}
      />
    );
  }

  async function conFotoValida() {
    const alCambiar = vi.fn();
    const usuario = userEvent.setup({ applyAccept: false });
    render(<ConEstado alCambiar={alCambiar} />);
    const input = screen.getByLabelText('Foto del daño (opcional)');
    await usuario.upload(input, archivo('bache.jpg', 'image/jpeg'));
    await usuario.upload(input, archivo('enorme.jpg', 'image/jpeg', 12 * MB));
    return { alCambiar, usuario, input };
  }

  it('un rechazo conserva la foto válida: el campo no queda inválido y el aviso lo aclara', async () => {
    const { alCambiar, input } = await conFotoValida();

    expect(screen.getByRole('alert')).toHaveTextContent(
      'La foto supera 10 MB. Se mantiene la foto anterior.',
    );
    expect(screen.getByAltText('Vista previa de la foto seleccionada')).toBeInTheDocument();
    expect(input).not.toHaveAttribute('aria-invalid');
    expect(input.getAttribute('aria-describedby')).toContain(screen.getByRole('alert').id);
    // Solo pasó la primera foto.
    expect(alCambiar).toHaveBeenCalledTimes(1);
  });

  it('«Quitar» borra la foto y el aviso', async () => {
    const { alCambiar, usuario, input } = await conFotoValida();

    await usuario.click(screen.getByRole('button', { name: 'Quitar' }));

    expect(alCambiar).toHaveBeenLastCalledWith(null);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByAltText('Vista previa de la foto seleccionada')).not.toBeInTheDocument();
    expect(input).not.toHaveAttribute('aria-invalid');
    expect(input).toHaveAccessibleDescription('JPG, PNG o WEBP, de hasta 10 MB.');
  });
});

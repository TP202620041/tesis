import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError } from '@/lib/api/errors';
import { comentar, listarComentarios } from '../api';
import type { ComentarioPublico } from '../model/tipos';
import { Comentarios } from './Comentarios';

vi.mock('../api', () => ({ comentar: vi.fn(), listarComentarios: vi.fn() }));

const RECHAZO =
  'El comentario tiene palabras que no están permitidas. Cámbialo para continuar.';
const NUEVO = { id: 3, contenido: 'Sigue roto', autor: 'Ana' } as ComentarioPublico;

beforeEach(() => {
  vi.mocked(listarComentarios).mockResolvedValue([]);
});

afterEach(() => {
  vi.mocked(comentar).mockReset();
  vi.mocked(listarComentarios).mockReset();
});

async function escribirYPublicar(texto: string) {
  const usuario = userEvent.setup();
  render(<Comentarios reporteId={8} puedeComentar />);
  await screen.findByText('Todavía nadie comentó sobre esta reparación.');
  await usuario.type(screen.getByLabelText('Escribe tu comentario'), texto);
  await usuario.click(screen.getByRole('button', { name: 'Publicar comentario' }));
  return usuario;
}

describe('Comentarios (US-27)', () => {
  it('publica y vacía el campo', async () => {
    vi.mocked(comentar).mockResolvedValue(NUEVO);
    await escribirYPublicar('Sigue roto');

    await waitFor(() => expect(screen.getByLabelText('Escribe tu comentario')).toHaveValue(''));
    expect(comentar).toHaveBeenCalledWith(8, 'Sigue roto');
  });

  it('sin sesión muestra los comentarios pero no el formulario', async () => {
    render(<Comentarios reporteId={8} puedeComentar={false} />);
    expect(await screen.findByText('Inicia sesión para comentar sobre esta reparación.')).toBeInTheDocument();
    expect(screen.queryByLabelText('Escribe tu comentario')).not.toBeInTheDocument();
  });
});

describe('Comentarios: la moderación (NC-10c)', () => {
  it('400 TEXTO_NO_PERMITIDO: conserva lo escrito y el error va en el campo', async () => {
    vi.mocked(comentar).mockRejectedValueOnce(
      new ApiError(400, RECHAZO, '/api/reportes/8/comentarios', ['contenido'], 'TEXTO_NO_PERMITIDO'),
    );
    await escribirYPublicar('Sigue roto, qué grosería');

    const error = await screen.findByText(RECHAZO);
    const campo = screen.getByLabelText('Escribe tu comentario');
    expect(campo).toHaveValue('Sigue roto, qué grosería');
    expect(campo).toHaveAttribute('aria-invalid', 'true');
    expect(campo).toHaveAccessibleDescription(RECHAZO);
    // Solo en el campo: ni error general ni el nombre del campo como detalle.
    expect(screen.getAllByRole('alert')).toEqual([error]);
    expect(screen.queryByText('contenido')).not.toBeInTheDocument();
  });

  it('al cambiar lo escrito, el error ya no aplica', async () => {
    vi.mocked(comentar).mockRejectedValueOnce(
      new ApiError(400, RECHAZO, '/api/reportes/8/comentarios', ['contenido'], 'TEXTO_NO_PERMITIDO'),
    );
    const usuario = await escribirYPublicar('Sigue roto, qué grosería');
    await screen.findByText(RECHAZO);

    await usuario.clear(screen.getByLabelText('Escribe tu comentario'));
    await usuario.type(screen.getByLabelText('Escribe tu comentario'), 'Sigue roto');

    expect(screen.queryByText(RECHAZO)).not.toBeInTheDocument();
    expect(screen.getByLabelText('Escribe tu comentario')).not.toHaveAttribute('aria-invalid');
  });

  it('un 409 (reporte no resuelto) sigue siendo un error general', async () => {
    vi.mocked(comentar).mockRejectedValueOnce(new ApiError(409, 'El reporte no está resuelto'));
    await escribirYPublicar('Hola');

    expect(await screen.findByText('El reporte no está resuelto')).toBeInTheDocument();
    expect(screen.getByLabelText('Escribe tu comentario')).not.toHaveAttribute('aria-invalid');
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError } from '@/lib/api/errors';
import { GestionCategorias } from './GestionCategorias';
import {
  cambiarActivaCategoria,
  categoriasDeGestion,
  crearCategoria,
  editarCategoria,
} from '../api';
import type { CategoriaGestion } from '../model/categorias';

vi.mock('../api', () => ({
  categoriasDeGestion: vi.fn(),
  crearCategoria: vi.fn(),
  editarCategoria: vi.fn(),
  cambiarActivaCategoria: vi.fn(),
}));

const listar = vi.mocked(categoriasDeGestion);
const crear = vi.mocked(crearCategoria);
const editar = vi.mocked(editarCategoria);
const cambiarActiva = vi.mocked(cambiarActivaCategoria);

const BACHE: CategoriaGestion = {
  id: 1,
  nombre: 'Bache',
  descripcion: 'Bache o hueco en la calzada',
  esEstandar: true,
  activo: true,
  distritoId: null,
  distritoNombre: null,
};
const CICLOVIA: CategoriaGestion = {
  id: 58,
  nombre: 'Ciclovia obstruida',
  descripcion: null,
  esEstandar: false,
  activo: false,
  distritoId: 15,
  distritoNombre: 'Miraflores',
};
const MALECON: CategoriaGestion = {
  ...CICLOVIA,
  id: 57,
  nombre: 'Malecon erosionado',
  descripcion: 'Borde del acantilado',
  activo: true,
};

function seccion(nombre: string) {
  return screen.getByRole('region', { name: nombre });
}

describe('GestionCategorias', () => {
  beforeEach(() => {
    for (const m of [listar, crear, editar, cambiarActiva]) m.mockReset();
    listar.mockResolvedValue([BACHE, CICLOVIA, MALECON]);
  });

  it('muestra las estándar sin acciones y las propias con su estado nombrado', async () => {
    render(<GestionCategorias />);
    await screen.findByText('Ciclovia obstruida');

    const estandar = seccion('Categorías estándar');
    expect(within(estandar).getByText('Bache')).toBeInTheDocument();
    expect(within(estandar).queryByRole('button')).not.toBeInTheDocument();

    const propias = seccion('Categorías de tu distrito');
    const [ciclovia, malecon] = within(propias).getAllByRole('listitem');
    expect(within(ciclovia!).getByText('Inactiva')).toBeInTheDocument();
    expect(within(ciclovia!).getByRole('button', { name: 'Reactivar' })).toBeInTheDocument();
    expect(within(malecon!).getByText('Activa')).toBeInTheDocument();
    expect(within(malecon!).getByRole('button', { name: 'Desactivar' })).toBeInTheDocument();
  });

  it('reactiva una categoría y recarga la lista', async () => {
    cambiarActiva.mockResolvedValue({ ...CICLOVIA, activo: true });
    render(<GestionCategorias />);
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Reactivar' }));

    expect(cambiarActiva).toHaveBeenCalledWith(58, true);
    await vi.waitFor(() => expect(listar).toHaveBeenCalledTimes(2));
  });

  it('activar/desactivar no desmonta la lista ni cierra el formulario abierto en otra fila', async () => {
    cambiarActiva.mockResolvedValue({ ...CICLOVIA, activo: true });
    render(<GestionCategorias />);
    const usuario = userEvent.setup();
    await screen.findByText('Malecon erosionado');
    const [ciclovia, malecon] = within(seccion('Categorías de tu distrito')).getAllByRole('listitem');

    await usuario.click(within(malecon!).getByRole('button', { name: 'Editar' }));
    await usuario.type(within(malecon!).getByLabelText('Nombre'), ' sur');
    await usuario.click(within(ciclovia!).getByRole('button', { name: 'Reactivar' }));

    await vi.waitFor(() => expect(listar).toHaveBeenCalledTimes(2));
    expect(screen.queryByText('Cargando…')).not.toBeInTheDocument();
    expect(ciclovia).toBeInTheDocument();
    expect(within(malecon!).getByLabelText('Nombre')).toHaveValue('Malecon erosionado sur');
  });

  it('muestra el mensaje del backend si no puede desactivar', async () => {
    cambiarActiva.mockRejectedValue(
      new ApiError(403, 'Solo puede gestionar las categorias personalizadas de Miraflores'),
    );
    render(<GestionCategorias />);
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Desactivar' }));

    expect(
      await screen.findByText('Solo puede gestionar las categorias personalizadas de Miraflores'),
    ).toBeInTheDocument();
  });

  it('edita enviando nombre y descripción actuales (el PATCH reemplaza)', async () => {
    editar.mockResolvedValue({ ...MALECON, nombre: 'Malecon con erosion' });
    render(<GestionCategorias />);
    const usuario = userEvent.setup();
    await screen.findByText('Malecon erosionado');
    const malecon = within(seccion('Categorías de tu distrito')).getAllByRole('listitem')[1]!;

    await usuario.click(within(malecon).getByRole('button', { name: 'Editar' }));
    const nombre = within(malecon).getByLabelText('Nombre');
    await usuario.clear(nombre);
    await usuario.type(nombre, 'Malecon con erosion');
    await usuario.click(within(malecon).getByRole('button', { name: 'Guardar cambios' }));

    expect(editar).toHaveBeenCalledWith(57, {
      nombre: 'Malecon con erosion',
      descripcion: 'Borde del acantilado',
    });
  });

  it('crea una categoría y muestra el 409 de nombre repetido', async () => {
    crear.mockRejectedValue(new ApiError(409, 'Ya existe una categoria con ese nombre'));
    render(<GestionCategorias />);
    const usuario = userEvent.setup();
    await screen.findByText('Malecon erosionado');

    await usuario.type(screen.getByLabelText('Nombre'), 'Bache');
    await usuario.click(screen.getByRole('button', { name: 'Crear categoría' }));

    expect(crear).toHaveBeenCalledWith({ nombre: 'Bache', descripcion: '' });
    expect(await screen.findByText('Ya existe una categoria con ese nombre')).toBeInTheDocument();
  });
});

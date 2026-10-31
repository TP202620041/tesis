import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EditarReporte } from './EditarReporte';
import { listarCategorias } from '@/lib/api/catalogos';
import { ApiError } from '@/lib/api/errors';
import { editarReporte } from '../api';
import type { ReporteResumen } from '../model/tipos';

vi.mock('../api', () => ({
  editarReporte: vi.fn(),
  cancelarReporte: vi.fn(),
}));
vi.mock('@/lib/api/catalogos', () => ({ listarCategorias: vi.fn() }));

const editar = vi.mocked(editarReporte);
const catalogo = vi.mocked(listarCategorias);

// Reporte con una categoría personalizada que la municipalidad desactivó.
const REPORTE: ReporteResumen = {
  id: 9,
  estado: 'PENDIENTE',
  categoriaId: 58,
  categoriaNombre: 'Ciclovia obstruida',
  titulo: 'Conos en la ciclovía',
  severidad: 'MEDIA',
  descripcion: 'Conos',
  distritoId: 15,
  totalAdhesiones: 1,
};

describe('EditarReporte (US-08 con categoría desactivada, US-29)', () => {
  beforeEach(() => {
    editar.mockReset();
    catalogo.mockReset();
    catalogo.mockResolvedValue([
      { id: 1, nombre: 'Bache', esEstandar: true },
      { id: 57, nombre: 'Malecon erosionado', esEstandar: false },
    ]);
  });

  it('muestra la categoría desactivada como seleccionada', async () => {
    render(<EditarReporte reporte={REPORTE} onActualizado={vi.fn()} />);
    expect(
      await screen.findByRole('option', { name: 'Ciclovia obstruida (ya no se ofrece)' }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Tipo de daño')).toHaveValue('58');
  });

  it('guarda la descripción sin reenviar la categoría que no cambió', async () => {
    editar.mockResolvedValue(REPORTE);
    const onActualizado = vi.fn();
    render(<EditarReporte reporte={REPORTE} onActualizado={onActualizado} />);
    const usuario = userEvent.setup();
    await screen.findByRole('option', { name: 'Bache' });

    await usuario.type(screen.getByLabelText('Descripción'), ' en la ciclovía');
    await usuario.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    expect(editar).toHaveBeenCalledWith(9, { descripcion: 'Conos en la ciclovía' });
    expect(onActualizado).toHaveBeenCalled();
  });

  it('envía la categoría si el ciudadano elige otra', async () => {
    editar.mockResolvedValue(REPORTE);
    render(<EditarReporte reporte={REPORTE} onActualizado={vi.fn()} />);
    const usuario = userEvent.setup();
    await screen.findByRole('option', { name: 'Bache' });

    await usuario.selectOptions(screen.getByLabelText('Tipo de daño'), '1');
    await usuario.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    expect(editar).toHaveBeenCalledWith(9, { categoriaId: 1, descripcion: 'Conos' });
  });

  it('NC-02: un título cambiado e inválido se marca en su campo y no se envía', async () => {
    render(<EditarReporte reporte={REPORTE} onActualizado={vi.fn()} />);
    const usuario = userEvent.setup();
    await screen.findByRole('option', { name: 'Bache' });

    await usuario.clear(screen.getByLabelText('Título'));
    await usuario.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    expect(await screen.findByText('Escribe un título para el reporte.')).toBeInTheDocument();
    expect(screen.getByLabelText('Título')).toHaveAttribute('aria-invalid', 'true');
    expect(editar).not.toHaveBeenCalled();
  });

  it('NC-02: muestra título y severidad actuales y envía solo lo que cambió', async () => {
    editar.mockResolvedValue(REPORTE);
    render(<EditarReporte reporte={REPORTE} onActualizado={vi.fn()} />);
    const usuario = userEvent.setup();
    await screen.findByRole('option', { name: 'Bache' });

    expect(screen.getByLabelText('Título')).toHaveValue('Conos en la ciclovía');
    expect(screen.getByRole('radio', { name: 'Media' })).toBeChecked();

    await usuario.clear(screen.getByLabelText('Título'));
    await usuario.type(screen.getByLabelText('Título'), 'Conos en la ciclovía norte');
    await usuario.click(screen.getByRole('radio', { name: 'Alta' }));
    await usuario.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    expect(editar).toHaveBeenCalledWith(9, {
      titulo: 'Conos en la ciclovía norte',
      severidad: 'ALTA',
      descripcion: 'Conos',
    });
  });

  describe('la moderación (NC-10c)', () => {
    const TITULO =
      'El título tiene palabras que no están permitidas. Cámbialo para continuar.';
    const DESCRIPCION =
      'La descripción tiene palabras que no están permitidas. Cámbiala para continuar.';
    const textoNoPermitido = (campo: string, mensaje: string) =>
      new ApiError(400, mensaje, '/api/reportes/9', [campo], 'TEXTO_NO_PERMITIDO');

    it('400 TEXTO_NO_PERMITIDO en la descripción: el error va en el campo, no arriba', async () => {
      editar.mockRejectedValueOnce(textoNoPermitido('descripcion', DESCRIPCION));
      const onActualizado = vi.fn();
      render(<EditarReporte reporte={REPORTE} onActualizado={onActualizado} />);
      const usuario = userEvent.setup();
      await screen.findByRole('option', { name: 'Bache' });

      await usuario.type(screen.getByLabelText('Descripción'), ' con una grosería');
      await usuario.click(screen.getByRole('button', { name: 'Guardar cambios' }));

      const error = await screen.findByText(DESCRIPCION);
      const descripcion = screen.getByLabelText('Descripción');
      expect(descripcion).toHaveAttribute('aria-invalid', 'true');
      expect(descripcion).toHaveAccessibleDescription(DESCRIPCION);
      expect(descripcion).toHaveValue('Conos con una grosería');
      expect(screen.getAllByRole('alert')).toEqual([error]);
      expect(onActualizado).not.toHaveBeenCalled();

      // Al cambiar lo escrito, el error ya no aplica.
      await usuario.type(descripcion, '!');
      expect(screen.queryByText(DESCRIPCION)).not.toBeInTheDocument();
    });

    it('400 TEXTO_NO_PERMITIDO en el título: el error va en el título', async () => {
      editar.mockRejectedValueOnce(textoNoPermitido('titulo', TITULO));
      render(<EditarReporte reporte={REPORTE} onActualizado={vi.fn()} />);
      const usuario = userEvent.setup();
      await screen.findByRole('option', { name: 'Bache' });

      await usuario.type(screen.getByLabelText('Título'), ' y algo más');
      await usuario.click(screen.getByRole('button', { name: 'Guardar cambios' }));

      expect(await screen.findByText(TITULO)).toBeInTheDocument();
      expect(screen.getByLabelText('Título')).toHaveAttribute('aria-invalid', 'true');
      expect(screen.getByLabelText('Descripción')).not.toHaveAttribute('aria-invalid');
    });

    it('un 409 sigue siendo un error general', async () => {
      editar.mockRejectedValueOnce(new ApiError(409, 'El reporte ya no está pendiente'));
      render(<EditarReporte reporte={REPORTE} onActualizado={vi.fn()} />);
      const usuario = userEvent.setup();
      await screen.findByRole('option', { name: 'Bache' });

      await usuario.click(screen.getByRole('button', { name: 'Guardar cambios' }));

      expect(await screen.findByText('El reporte ya no está pendiente')).toBeInTheDocument();
      expect(screen.getByLabelText('Descripción')).not.toHaveAttribute('aria-invalid');
    });
  });
});

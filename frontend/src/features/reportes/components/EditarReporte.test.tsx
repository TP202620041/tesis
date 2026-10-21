import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EditarReporte } from './EditarReporte';
import { listarCategorias } from '@/lib/api/catalogos';
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
});

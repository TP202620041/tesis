import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError } from '@/lib/api/errors';
import { DashboardDistrito } from './DashboardDistrito';
import { dashboardMiDistrito } from '../api';
import type { DashboardDistrito as Dashboard } from '../model/dashboard';

vi.mock('../api', () => ({ dashboardMiDistrito: vi.fn() }));

const cargar = vi.mocked(dashboardMiDistrito);

const SIN_REPORTES: Dashboard = {
  resumen: {
    distritoId: 4,
    distritoNombre: 'Barranco',
    categoriaId: null,
    totalReportes: 0,
    totalResueltos: 0,
    tasaResolucion: null,
    tiempoPromedioHoras: null,
    satisfaccionPromedio: null,
    totalCalificaciones: 0,
    calculatedAt: '2026-10-13T15:00:00Z',
  },
  reportesSinResponsable: 0,
  reportesEstancados: 0,
};

function valorDe(etiqueta: string): string | null {
  const tarjeta = screen.getByText(etiqueta).parentElement as HTMLElement;
  return within(tarjeta).getAllByRole('definition')[0]?.textContent ?? null;
}

describe('DashboardDistrito', () => {
  beforeEach(() => cargar.mockReset());

  it('muestra "Sin datos" en las métricas null y 0 en los conteos', async () => {
    cargar.mockResolvedValue(SIN_REPORTES);
    render(<DashboardDistrito />);

    expect(await screen.findByText(/Barranco/)).toBeInTheDocument();
    expect(valorDe('Tasa de resolución')).toBe('Sin datos');
    expect(valorDe('Tiempo promedio de atención')).toBe('Sin datos');
    expect(valorDe('Satisfacción ciudadana')).toBe('Sin datos');
    expect(valorDe('Reportes recibidos')).toBe('0');
    expect(valorDe('Sin responsable asignado')).toBe('0');
    expect(valorDe('Estancados')).toBe('0');
  });

  it('separa el índice público de las señales internas', async () => {
    cargar.mockResolvedValue({ ...SIN_REPORTES, reportesEstancados: 5 });
    render(<DashboardDistrito />);

    const interna = await screen.findByRole('region', { name: 'Gestión interna' });
    expect(within(interna).getByText('Estancados')).toBeInTheDocument();
    expect(within(interna).getByText('5')).toBeInTheDocument();
    const indice = screen.getByRole('region', { name: 'Índice de desempeño' });
    expect(within(indice).queryByText('Estancados')).toBeNull();
  });

  it('ante un error muestra el mensaje y permite reintentar', async () => {
    cargar.mockRejectedValueOnce(new ApiError(404, 'Sin datos de desempeno para el distrito 4'));
    cargar.mockResolvedValueOnce(SIN_REPORTES);
    render(<DashboardDistrito />);

    expect(await screen.findByText('Sin datos de desempeno para el distrito 4')).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Reintentar' }));

    expect(await screen.findByText(/Barranco/)).toBeInTheDocument();
    expect(cargar).toHaveBeenCalledTimes(2);
  });
});

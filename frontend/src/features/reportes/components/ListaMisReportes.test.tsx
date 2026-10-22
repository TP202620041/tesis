import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { ApiError } from '@/lib/api/errors';
import { misAdhesiones, misReportes, pendientesDeCalificacion } from '../api';
import type { ReporteResumen } from '../model/tipos';
import { ListaMisReportes } from './ListaMisReportes';

/*
 * US-07 + QA-1 M-6: la página compone la lista propia y «Reportes que
 * apoyas», con cargas independientes. Se simula solo `../api` (los hooks son
 * los reales): un fallo de una lista no debe tumbar la otra.
 */

vi.mock('../api', () => ({
  misReportes: vi.fn(),
  pendientesDeCalificacion: vi.fn(),
  misAdhesiones: vi.fn(),
  crearReporte: vi.fn(),
  colaDeReportes: { listar: async () => [], suscribir: () => () => {} },
}));

const PROPIO: ReporteResumen = {
  id: 12,
  estado: 'PENDIENTE',
  titulo: 'Bache en mi cuadra',
  categoriaNombre: 'Bache',
  distritoNombre: 'Miraflores',
};
const APOYADO: ReporteResumen = {
  id: 184,
  estado: 'EN_PROCESO',
  titulo: 'Bache frente al parque',
  categoriaNombre: 'Bache',
  distritoNombre: 'Miraflores',
  totalAdhesiones: 3,
};

afterEach(() => {
  vi.mocked(misReportes).mockReset();
  vi.mocked(pendientesDeCalificacion).mockReset();
  vi.mocked(misAdhesiones).mockReset();
});

function regionDeApoyos() {
  return screen.getByRole('region', { name: 'Reportes que apoyas' });
}

describe('ListaMisReportes', () => {
  it('los propios enlazan a su detalle de creador y los apoyados al público', async () => {
    vi.mocked(misReportes).mockResolvedValue([PROPIO]);
    vi.mocked(pendientesDeCalificacion).mockResolvedValue([]);
    vi.mocked(misAdhesiones).mockResolvedValue([APOYADO]);
    render(<ListaMisReportes usuarioId={7} />);

    expect(await screen.findByRole('link', { name: /Bache en mi cuadra/ })).toHaveAttribute(
      'href',
      '/mis-reportes/12',
    );
    const apoyado = await within(regionDeApoyos()).findByRole('link', { name: /Bache frente al parque/ });
    expect(apoyado).toHaveAttribute('href', '/reportes/184');
    expect(within(regionDeApoyos()).queryByRole('link', { name: /Bache en mi cuadra/ })).not.toBeInTheDocument();
  });

  it('QA-1 M-6: si falla «Reportes que apoyas», la lista propia se ve igual y el error queda en la sección', async () => {
    vi.mocked(misReportes).mockResolvedValue([PROPIO]);
    vi.mocked(pendientesDeCalificacion).mockResolvedValue([]);
    // Un backend anterior a QA-1 no tiene la ruta.
    vi.mocked(misAdhesiones).mockRejectedValue(new ApiError(404, 'No encontrado'));
    render(<ListaMisReportes usuarioId={7} />);

    expect(await screen.findByRole('link', { name: /Bache en mi cuadra/ })).toHaveAttribute(
      'href',
      '/mis-reportes/12',
    );
    expect(
      await within(regionDeApoyos()).findByText('No se pudieron cargar los reportes que apoyas.'),
    ).toBeInTheDocument();
    expect(within(regionDeApoyos()).getByRole('status')).toBeInTheDocument();
    expect(within(regionDeApoyos()).getByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByText('No se pudieron cargar tus reportes.')).not.toBeInTheDocument();
  });

  it('al revés: si falla la lista propia, «Reportes que apoyas» se ve igual', async () => {
    vi.mocked(misReportes).mockRejectedValue(new ApiError(500, 'Fallo'));
    vi.mocked(pendientesDeCalificacion).mockResolvedValue([]);
    vi.mocked(misAdhesiones).mockResolvedValue([APOYADO]);
    render(<ListaMisReportes usuarioId={7} />);

    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudieron cargar tus reportes.');
    expect(
      await within(regionDeApoyos()).findByRole('link', { name: /Bache frente al parque/ }),
    ).toHaveAttribute('href', '/reportes/184');
    expect(within(regionDeApoyos()).queryByRole('status')).not.toBeInTheDocument();
  });
});

import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { bandejaDeModeracion } from '../api';
import type { FilaDeModeracion, PaginaDeModeracion } from '../model/tipos';
import { BandejaModeracion } from './BandejaModeracion';

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => <a href={href}>{children}</a>,
}));
vi.mock('../api', () => ({ bandejaDeModeracion: vi.fn() }));

afterEach(() => {
  vi.mocked(bandejaDeModeracion).mockReset();
});

const FILA: FilaDeModeracion = {
  reporteId: 42,
  titulo: 'Bache en la avenida',
  estado: 'RECIBIDO',
  distritoNombre: 'Miraflores',
  tieneFoto: true,
  oculto: false,
  fotoOculta: false,
  totalDenuncias: 3,
  porMotivo: { DATOS_PERSONALES: 2, OTRO: 1 },
  primeraDenuncia: '2026-10-29T14:50:00Z',
  ultimaDenuncia: '2026-10-29T15:00:00Z',
};

const OCULTA_SIN_DENUNCIAS: FilaDeModeracion = {
  ...FILA,
  reporteId: 7,
  titulo: 'Poste caído',
  oculto: true,
  fotoOculta: true,
  totalDenuncias: 0,
  porMotivo: {},
  primeraDenuncia: null,
  ultimaDenuncia: null,
};

function pagina(filas: FilaDeModeracion[], extra: Partial<PaginaDeModeracion> = {}): PaginaDeModeracion {
  return { filas, pagina: 0, totalPaginas: 1, total: filas.length, ...extra };
}

describe('BandejaModeracion (NC-11b)', () => {
  it('arranca en las denuncias pendientes y lista cada reporte con sus denuncias por motivo', async () => {
    vi.mocked(bandejaDeModeracion).mockResolvedValue(pagina([FILA]));
    render(<BandejaModeracion />);

    expect(screen.getByLabelText('Ver')).toHaveValue('PENDIENTE');
    const fila = await screen.findByRole('link', { name: /Bache en la avenida/ });
    expect(fila).toHaveAttribute('href', '/admin/moderacion/42');
    expect(fila).toHaveTextContent('3 denuncias: Muestra datos personales (2), Otro motivo (1)');
    expect(fila).toHaveTextContent('#42 · Miraflores · con foto');
    expect(bandejaDeModeracion).toHaveBeenCalledWith({ vista: 'PENDIENTE', pagina: 0 });
  });

  it('ofrece las cuatro vistas y cambiarla vuelve a pedir desde la primera página', async () => {
    vi.mocked(bandejaDeModeracion).mockResolvedValue(pagina([FILA], { pagina: 1, totalPaginas: 2 }));
    render(<BandejaModeracion />);
    await screen.findByRole('link', { name: /Bache/ });

    const opciones = screen.getAllByRole('option').map((o) => o.textContent);
    expect(opciones).toEqual(['Denuncias pendientes', 'Denuncias atendidas', 'Denuncias desestimadas', 'Ocultos']);

    await userEvent.selectOptions(screen.getByLabelText('Ver'), 'DESESTIMADA');
    await waitFor(() =>
      expect(bandejaDeModeracion).toHaveBeenLastCalledWith({ vista: 'DESESTIMADA', pagina: 0 }),
    );
  });

  it('«Ocultos» (decisión del 30/10) lista también los reportes ocultos sin denuncias', async () => {
    vi.mocked(bandejaDeModeracion).mockResolvedValue(pagina([OCULTA_SIN_DENUNCIAS]));
    render(<BandejaModeracion />);
    await screen.findByRole('link', { name: /Poste caído/ });

    await userEvent.selectOptions(screen.getByLabelText('Ver'), 'OCULTOS');

    await waitFor(() => expect(bandejaDeModeracion).toHaveBeenLastCalledWith({ vista: 'OCULTOS', pagina: 0 }));
    expect(screen.getByText(/tengan denuncias o no/)).toBeInTheDocument();
    const fila = screen.getByRole('link', { name: /Poste caído/ });
    expect(fila).toHaveTextContent('Reporte oculto');
    expect(fila).toHaveTextContent('Foto oculta');
    expect(fila).toHaveTextContent('Sin denuncias');
    expect(fila).not.toHaveTextContent('Última denuncia');
  });

  it('sin filas lo dice según la vista', async () => {
    vi.mocked(bandejaDeModeracion).mockResolvedValue(pagina([]));
    render(<BandejaModeracion />);
    expect(await screen.findByText('No hay reportes con denuncias en este estado.')).toBeInTheDocument();

    await userEvent.selectOptions(screen.getByLabelText('Ver'), 'OCULTOS');
    expect(await screen.findByText('No hay reportes ni fotos ocultos.')).toBeInTheDocument();
  });

  it('pagina en el servidor', async () => {
    vi.mocked(bandejaDeModeracion).mockResolvedValue(pagina([FILA], { totalPaginas: 3, total: 50 }));
    render(<BandejaModeracion />);
    await screen.findByText('Página 1 de 3');

    expect(screen.getByRole('button', { name: 'Anterior' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
    await waitFor(() => expect(bandejaDeModeracion).toHaveBeenLastCalledWith({ vista: 'PENDIENTE', pagina: 1 }));
  });

  it('un fallo de la carga se muestra como alerta', async () => {
    vi.mocked(bandejaDeModeracion).mockRejectedValue(new Error('x'));
    render(<BandejaModeracion />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Ocurrió un error inesperado.');
  });
});

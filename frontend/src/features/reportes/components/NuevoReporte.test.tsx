import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { distritoPorCoordenadas, listarCategorias } from '@/lib/api/catalogos';
import type { CategoriaDano, Distrito } from '@/lib/types/domain';
import { crearReporte } from '../api';
import { useEncolarReporte } from '../hooks/useColaOffline';
import type { ReporteCreado } from '../model/tipos';
import { NuevoReporte } from './NuevoReporte';

vi.mock('next/dynamic', () => ({ default: () => () => null }));
vi.mock('../api', () => ({ crearReporte: vi.fn() }));
vi.mock('@/lib/api/catalogos', () => ({ distritoPorCoordenadas: vi.fn(), listarCategorias: vi.fn() }));
vi.mock('../hooks/useColaOffline', () => ({ useEncolarReporte: vi.fn() }));

const RESPUESTA: ReporteCreado = {
  id: 42,
  esAdhesion: false,
  totalAdhesiones: 1,
  distritoNombre: 'Miraflores',
  categoriaNombre: 'Bache',
  fotoUrl: null,
  titulo: 'Bache profundo',
  severidad: 'ALTA',
};

beforeEach(() => {
  vi.mocked(useEncolarReporte).mockReturnValue(vi.fn());
  vi.mocked(listarCategorias).mockResolvedValue([{ id: 3, nombre: 'Bache', esEstandar: true } as CategoriaDano]);
  vi.mocked(distritoPorCoordenadas).mockResolvedValue({ id: 1, nombre: 'Miraflores' } as Distrito);
  vi.stubGlobal('navigator', {
    ...navigator,
    geolocation: {
      getCurrentPosition: (ok: PositionCallback) =>
        ok({ coords: { latitude: -12.12, longitude: -77.03, accuracy: 5 } } as GeolocationPosition),
    },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.mocked(crearReporte).mockReset();
});

async function reportar() {
  const usuario = userEvent.setup();
  render(<NuevoReporte usuarioId={7} />);
  await usuario.click(screen.getByRole('button', { name: 'Usar mi ubicación (GPS)' }));
  await screen.findByText('Municipalidad de Miraflores');
  await usuario.selectOptions(screen.getByLabelText('Tipo de daño'), '3');
  await usuario.type(screen.getByLabelText('Título'), 'Bache profundo');
  await usuario.click(screen.getByRole('radio', { name: 'Alta' }));
  await usuario.click(screen.getByRole('button', { name: 'Enviar reporte' }));
}

describe('NuevoReporte: confirmación con título y severidad (NC-02)', () => {
  it('reporte nuevo: muestra el título y la severidad de la respuesta', async () => {
    vi.mocked(crearReporte).mockResolvedValue(RESPUESTA);
    await reportar();

    expect(await screen.findByText('Reporte enviado')).toBeInTheDocument();
    expect(screen.getByText('Bache profundo')).toBeInTheDocument();
    expect(screen.getByText('Alta')).toBeInTheDocument();
  });

  it('adhesión (US-09): muestra los del reporte EXISTENTE, no los que escribió', async () => {
    vi.mocked(crearReporte).mockResolvedValue({
      ...RESPUESTA,
      esAdhesion: true,
      totalAdhesiones: 3,
      titulo: 'Hueco grande en la berma',
      severidad: 'MEDIA',
    });
    await reportar();

    expect(await screen.findByText('Ya existía un reporte de este daño')).toBeInTheDocument();
    expect(screen.getAllByText(/Hueco grande en la berma/).length).toBeGreaterThan(0);
    expect(screen.getByText('Media')).toBeInTheDocument();
    expect(screen.queryByText('Bache profundo')).not.toBeInTheDocument();
    expect(screen.queryByText('Alta')).not.toBeInTheDocument();
  });

  it('respuesta idempotente anterior a NC-02 (sin título): «Sin título», sin romper', async () => {
    vi.mocked(crearReporte).mockResolvedValue({ ...RESPUESTA, titulo: null, severidad: null });
    await reportar();

    expect(await screen.findByText('Sin título')).toBeInTheDocument();
  });
});

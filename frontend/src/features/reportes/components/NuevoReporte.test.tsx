import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { distritoPorCoordenadas, listarCategorias } from '@/lib/api/catalogos';
import { ApiError, NetworkError } from '@/lib/api/errors';
import type { CategoriaDano, Distrito } from '@/lib/types/domain';
import { clasificarFoto, crearReporte } from '../api';
import { useEncolarReporte } from '../hooks/useColaOffline';
import type { ReporteCreado } from '../model/tipos';
import { NuevoReporte } from './NuevoReporte';

vi.mock('next/dynamic', () => ({ default: () => () => null }));
vi.mock('../api', () => ({ crearReporte: vi.fn(), clasificarFoto: vi.fn() }));
vi.mock('@/lib/api/catalogos', () => ({ distritoPorCoordenadas: vi.fn(), listarCategorias: vi.fn() }));
vi.mock('../hooks/useColaOffline', () => ({ useEncolarReporte: vi.fn(), anotarModeracionNoDisponible: vi.fn() }));

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
  vi.mocked(clasificarFoto).mockResolvedValue({ fotoNoPermitida: false, sugerencia: null });
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
    expect(screen.getByRole('link', { name: 'Ver mis reportes' })).toHaveAttribute('href', '/mis-reportes');
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
    // QA-1 M-6: no lo creó, así que no está entre los suyos sino entre los que apoya.
    expect(screen.getByRole('link', { name: 'Ver los reportes que apoyas' })).toHaveAttribute(
      'href',
      '/mis-reportes#reportes-que-apoyas',
    );
    expect(screen.queryByRole('link', { name: 'Ver mis reportes' })).not.toBeInTheDocument();
  });

  it('respuesta idempotente anterior a NC-02 (sin título): «Sin título», sin romper', async () => {
    vi.mocked(crearReporte).mockResolvedValue({ ...RESPUESTA, titulo: null, severidad: null });
    await reportar();

    expect(await screen.findByText('Sin título')).toBeInTheDocument();
  });
});

describe('NuevoReporte: pendiente de envío (US-06, NC-10c)', () => {
  beforeEach(() => {
    // jsdom no implementa las URL `blob:` de la vista previa de la foto.
    Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:x'), revokeObjectURL: vi.fn() });
  });

  afterEach(() => {
    // Primero se desmonta: la vista previa llama a `revokeObjectURL` al limpiarse.
    cleanup();
    const urlMutable = URL as unknown as Record<string, unknown>;
    delete urlMutable.createObjectURL;
    delete urlMutable.revokeObjectURL;
  });

  it('sin conexión dice que no hay conexión', async () => {
    vi.mocked(crearReporte).mockRejectedValue(new NetworkError());
    vi.mocked(useEncolarReporte).mockReturnValue(vi.fn().mockResolvedValue(undefined));
    await reportar();

    expect(await screen.findByText('Pendiente de envío')).toBeInTheDocument();
    expect(screen.getByText(/^No hay conexión, así que tu reporte quedó/)).toBeInTheDocument();
  });

  it('guardado porque no se pudo revisar la foto: no dice «No hay conexión»', async () => {
    const encolar = vi.fn().mockResolvedValue(undefined);
    vi.mocked(useEncolarReporte).mockReturnValue(encolar);
    vi.mocked(crearReporte).mockRejectedValue(
      new ApiError(503, 'No pudimos revisar la foto…', '/api/reportes', [], 'MODERACION_NO_DISPONIBLE'),
    );
    const usuario = userEvent.setup();
    render(<NuevoReporte usuarioId={7} />);
    await usuario.upload(
      screen.getByLabelText('Foto del daño (opcional)'),
      new File(['x'], 'bache.jpg', { type: 'image/jpeg' }),
    );
    await usuario.click(screen.getByRole('button', { name: 'Usar mi ubicación (GPS)' }));
    await screen.findByText('Municipalidad de Miraflores');
    await usuario.selectOptions(screen.getByLabelText('Tipo de daño'), '3');
    await usuario.type(screen.getByLabelText('Título'), 'Bache profundo');
    await usuario.click(screen.getByRole('radio', { name: 'Alta' }));
    await usuario.click(screen.getByRole('button', { name: 'Enviar reporte' }));

    await usuario.click(await screen.findByRole('button', { name: 'Guardar para enviar después' }));

    expect(await screen.findByText('Pendiente de envío')).toBeInTheDocument();
    expect(
      screen.getByText(/^No pudimos revisar la foto en este momento, así que tu reporte quedó/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/No hay conexión/)).not.toBeInTheDocument();
    expect(encolar).toHaveBeenCalledTimes(1);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { distritoPorCoordenadas } from '@/lib/api/catalogos';
import { NetworkError } from '@/lib/api/errors';
import type { CategoriaDano, Distrito } from '@/lib/types/domain';
import { crearReporte, listarCategorias } from '../api';
import { useEncolarReporte } from '../hooks/useColaOffline';
import { FormularioReporte } from './FormularioReporte';

vi.mock('next/dynamic', () => ({ default: () => () => null }));
vi.mock('../api', () => ({ crearReporte: vi.fn(), listarCategorias: vi.fn() }));
vi.mock('@/lib/api/catalogos', () => ({ distritoPorCoordenadas: vi.fn() }));
vi.mock('../hooks/useColaOffline', () => ({ useEncolarReporte: vi.fn() }));

const encolar = vi.fn();

beforeEach(() => {
  vi.mocked(useEncolarReporte).mockReturnValue(encolar);
  vi.mocked(listarCategorias).mockResolvedValue([{ id: 3, nombre: 'Bache', esEstandar: true } as CategoriaDano]);
  vi.mocked(distritoPorCoordenadas).mockResolvedValue({ id: 1, nombre: 'Miraflores' } as Distrito);
  vi.mocked(crearReporte).mockRejectedValue(new NetworkError());
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
  encolar.mockReset();
  vi.mocked(crearReporte).mockReset();
});

async function llenarYEnviar(usuario: ReturnType<typeof userEvent.setup>) {
  await usuario.click(screen.getByRole('button', { name: 'Usar mi ubicación (GPS)' }));
  await screen.findByText('Municipalidad de Miraflores');
  await usuario.selectOptions(screen.getByLabelText('Tipo de daño'), '3');
  await usuario.click(screen.getByRole('button', { name: 'Enviar reporte' }));
}

const claveDe = (llamada: number) =>
  (vi.mocked(crearReporte).mock.calls[llamada]?.[0] as { idempotencyKey: string }).idempotencyKey;

describe('FormularioReporte sin conexión (US-06)', () => {
  it('NetworkError: encola con la misma clave y el siguiente reporte usa una nueva', async () => {
    encolar.mockResolvedValue(undefined);
    const onEncolado = vi.fn();
    const usuario = userEvent.setup();
    render(<FormularioReporte usuarioId={7} onCreado={vi.fn()} onEncolado={onEncolado} />);

    await llenarYEnviar(usuario);

    await waitFor(() => expect(onEncolado).toHaveBeenCalledTimes(1));
    expect(encolar).toHaveBeenCalledWith(expect.objectContaining({ idempotencyKey: claveDe(0) }));

    await usuario.click(screen.getByRole('button', { name: 'Enviar reporte' }));
    await waitFor(() => expect(crearReporte).toHaveBeenCalledTimes(2));
    expect(claveDe(1)).not.toBe(claveDe(0));
  });

  it('sin IndexedDB: avisa y conserva la clave para el reintento manual', async () => {
    encolar.mockRejectedValue(new Error('sin IndexedDB'));
    const onEncolado = vi.fn();
    const usuario = userEvent.setup();
    render(<FormularioReporte usuarioId={7} onCreado={vi.fn()} onEncolado={onEncolado} />);

    await llenarYEnviar(usuario);

    expect(
      await screen.findByText(/Sin conexión. Tu reporte no se envió/),
    ).toBeInTheDocument();
    expect(onEncolado).not.toHaveBeenCalled();

    await usuario.click(screen.getByRole('button', { name: 'Enviar reporte' }));
    await waitFor(() => expect(crearReporte).toHaveBeenCalledTimes(2));
    expect(claveDe(1)).toBe(claveDe(0));
  });
});

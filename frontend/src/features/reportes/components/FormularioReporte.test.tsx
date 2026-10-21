import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { distritoPorCoordenadas, listarCategorias } from '@/lib/api/catalogos';
import { ApiError, NetworkError } from '@/lib/api/errors';
import type { CategoriaDano, Distrito } from '@/lib/types/domain';
import { crearReporte } from '../api';
import { useEncolarReporte } from '../hooks/useColaOffline';
import { FormularioReporte } from './FormularioReporte';

vi.mock('next/dynamic', () => ({ default: () => () => null }));
vi.mock('../api', () => ({ crearReporte: vi.fn() }));
vi.mock('@/lib/api/catalogos', () => ({ distritoPorCoordenadas: vi.fn(), listarCategorias: vi.fn() }));
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
  await usuario.type(screen.getByLabelText('Título'), 'Bache profundo');
  await usuario.click(screen.getByRole('radio', { name: 'Alta' }));
  await usuario.click(screen.getByRole('button', { name: 'Enviar reporte' }));
}

const claveDe = (llamada: number) =>
  (vi.mocked(crearReporte).mock.calls[llamada]?.[0] as { idempotencyKey: string }).idempotencyKey;

describe('FormularioReporte: título y severidad (NC-02)', () => {
  it('la severidad empieza sin elegir y sin ella no se envía', async () => {
    const usuario = userEvent.setup();
    render(<FormularioReporte usuarioId={7} onCreado={vi.fn()} onEncolado={vi.fn()} />);

    for (const nombre of ['Baja', 'Media', 'Alta']) {
      expect(screen.getByRole('radio', { name: nombre })).not.toBeChecked();
    }

    await usuario.click(screen.getByRole('button', { name: 'Usar mi ubicación (GPS)' }));
    await screen.findByText('Municipalidad de Miraflores');
    await usuario.selectOptions(screen.getByLabelText('Tipo de daño'), '3');
    await usuario.type(screen.getByLabelText('Título'), 'Bache profundo');
    await usuario.click(screen.getByRole('button', { name: 'Enviar reporte' }));

    const mensaje = await screen.findByText('Elige la severidad del daño.');
    // El error queda en el grupo de severidad, enlazado por aria-describedby.
    const grupo = screen.getByRole('radiogroup', { name: 'Severidad' });
    expect(grupo).toHaveAttribute('aria-invalid', 'true');
    expect(grupo.getAttribute('aria-describedby')).toContain(mensaje.id);
    expect(screen.getByLabelText('Título')).not.toHaveAttribute('aria-invalid');
    expect(crearReporte).not.toHaveBeenCalled();
  });

  it('un error de campo borra el error anterior del envío (no conviven)', async () => {
    vi.mocked(crearReporte).mockRejectedValueOnce(
      new ApiError(409, 'Ya reportaste este daño'),
    );
    const usuario = userEvent.setup();
    render(<FormularioReporte usuarioId={7} onCreado={vi.fn()} onEncolado={vi.fn()} />);

    await llenarYEnviar(usuario);
    expect(await screen.findByText('Ya reportaste este daño')).toBeInTheDocument();

    await usuario.clear(screen.getByLabelText('Título'));
    await usuario.click(screen.getByRole('button', { name: 'Enviar reporte' }));

    expect(await screen.findByText('Escribe un título para el reporte.')).toBeInTheDocument();
    expect(screen.queryByText('Ya reportaste este daño')).not.toBeInTheDocument();
    expect(crearReporte).toHaveBeenCalledTimes(1);
  });

  it('un título corto se marca en su campo y no se envía', async () => {
    const usuario = userEvent.setup();
    render(<FormularioReporte usuarioId={7} onCreado={vi.fn()} onEncolado={vi.fn()} />);
    await usuario.click(screen.getByRole('button', { name: 'Usar mi ubicación (GPS)' }));
    await screen.findByText('Municipalidad de Miraflores');
    await usuario.selectOptions(screen.getByLabelText('Tipo de daño'), '3');
    await usuario.type(screen.getByLabelText('Título'), 'Hoyo');
    await usuario.click(screen.getByRole('radio', { name: 'Alta' }));
    await usuario.click(screen.getByRole('button', { name: 'Enviar reporte' }));

    const mensaje = await screen.findByText(/al menos 5/);
    const titulo = screen.getByLabelText('Título');
    expect(titulo).toHaveAttribute('aria-invalid', 'true');
    expect(titulo.getAttribute('aria-describedby')).toContain(mensaje.id);
    expect(crearReporte).not.toHaveBeenCalled();
  });

  it('envía el título recortado y la severidad elegida', async () => {
    const usuario = userEvent.setup();
    render(<FormularioReporte usuarioId={7} onCreado={vi.fn()} onEncolado={vi.fn()} />);

    await usuario.type(screen.getByLabelText('Título'), '  ');
    await llenarYEnviar(usuario);

    await waitFor(() => expect(crearReporte).toHaveBeenCalledTimes(1));
    expect(crearReporte).toHaveBeenCalledWith(
      expect.objectContaining({ titulo: 'Bache profundo', severidad: 'ALTA' }),
    );
  });
});

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

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { ApiError, CODIGO_TERMINOS_PENDIENTES, NetworkError } from '@/lib/api/errors';
import { crearReporte } from '../api';
import type { ReporteCreado } from '../model/tipos';
import { useEncolarReporte } from './useColaOffline';
import { useCrearReporte, type DatosDelReporte, type DesenlaceDelEnvio } from './useCrearReporte';

vi.mock('../api', () => ({ crearReporte: vi.fn() }));
vi.mock('./useColaOffline', () => ({ useEncolarReporte: vi.fn() }));

const encolar = vi.fn();
const CREADO = { id: 40, esAdhesion: false } as ReporteCreado;
const DATOS: DatosDelReporte = {
  ubicacion: { latitud: -12.12, longitud: -77.03, manual: true },
  categoriaId: 3,
  descripcion: 'Bache profundo',
  foto: null,
};

beforeEach(() => {
  vi.mocked(useEncolarReporte).mockReturnValue(encolar);
});

afterEach(() => {
  encolar.mockReset();
  vi.mocked(crearReporte).mockReset();
});

const claveDe = (llamada: number) => vi.mocked(crearReporte).mock.calls[llamada]?.[0].idempotencyKey;

function montar() {
  const { result } = renderHook(() => useCrearReporte(7));
  const enviar = async (datos = DATOS) => {
    let desenlace: DesenlaceDelEnvio = null;
    await act(async () => {
      desenlace = await result.current.enviar(datos);
    });
    return desenlace as DesenlaceDelEnvio;
  };
  return { result, enviar };
}

describe('useCrearReporte (US-05, US-06)', () => {
  it('envía los datos del formulario con una Idempotency-Key', async () => {
    vi.mocked(crearReporte).mockResolvedValue(CREADO);
    const { enviar } = montar();

    expect(await enviar()).toEqual({ tipo: 'creado', reporte: CREADO });
    expect(crearReporte).toHaveBeenCalledWith({
      latitud: -12.12,
      longitud: -77.03,
      categoriaId: 3,
      descripcion: 'Bache profundo',
      ubicacionManual: true,
      foto: null,
      idempotencyKey: expect.any(String),
    });
  });

  it('el reintento tras un error del backend usa la MISMA clave', async () => {
    vi.mocked(crearReporte)
      .mockRejectedValueOnce(new ApiError(500, 'Fallo'))
      .mockResolvedValueOnce(CREADO);
    const { result, enviar } = montar();

    expect(await enviar()).toBeNull();
    expect(result.current.error?.mensaje).toBe('Fallo');
    expect(await enviar()).toEqual({ tipo: 'creado', reporte: CREADO });
    expect(claveDe(1)).toBe(claveDe(0));
  });

  it('tras un envío exitoso el siguiente reporte usa una clave nueva', async () => {
    vi.mocked(crearReporte).mockResolvedValue(CREADO);
    const { enviar } = montar();
    await enviar();
    await enviar();
    expect(claveDe(1)).not.toBe(claveDe(0));
  });

  it('sin red encola con la misma clave y luego la renueva', async () => {
    vi.mocked(crearReporte).mockRejectedValue(new NetworkError());
    encolar.mockResolvedValue(undefined);
    const { enviar } = montar();

    expect(await enviar()).toEqual({ tipo: 'encolado' });
    expect(encolar).toHaveBeenCalledWith(expect.objectContaining({ idempotencyKey: claveDe(0) }));

    await enviar();
    expect(claveDe(1)).not.toBe(claveDe(0));
  });

  it('sin IndexedDB avisa y conserva la clave para el reintento manual', async () => {
    vi.mocked(crearReporte).mockRejectedValue(new NetworkError());
    encolar.mockRejectedValue(new Error('sin IndexedDB'));
    const { result, enviar } = montar();

    expect(await enviar()).toBeNull();
    expect(result.current.error?.mensaje).toMatch(/Sin conexión. Tu reporte no se envió/);

    await enviar();
    expect(claveDe(1)).toBe(claveDe(0));
  });

  it('el 403 TERMINOS_PENDIENTES no se encola y conserva la clave', async () => {
    vi.mocked(crearReporte).mockRejectedValue(
      new ApiError(403, 'Acepta los términos', '', [], CODIGO_TERMINOS_PENDIENTES),
    );
    const { result, enviar } = montar();

    expect(await enviar()).toBeNull();
    expect(encolar).not.toHaveBeenCalled();
    expect(result.current.error?.mensaje).toBe('Acepta los términos');

    await enviar();
    expect(claveDe(1)).toBe(claveDe(0));
  });

  it('sin ubicación o sin categoría no llega al backend', async () => {
    const { result, enviar } = montar();

    expect(await enviar({ ...DATOS, ubicacion: null })).toBeNull();
    expect(result.current.error?.mensaje).toMatch(/Indica dónde está el daño/);

    expect(await enviar({ ...DATOS, categoriaId: null })).toBeNull();
    expect(result.current.error?.mensaje).toBe('Elige el tipo de daño.');

    expect(crearReporte).not.toHaveBeenCalled();
  });
});

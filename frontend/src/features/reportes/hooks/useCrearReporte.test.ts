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
  titulo: '  Bache profundo en la berma  ',
  severidad: 'ALTA',
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
      titulo: 'Bache profundo en la berma',
      severidad: 'ALTA',
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

  // DEP-11/DEP-12: respuestas del saneado de la foto. Son del backend, no de
  // la red: se muestran con su mensaje y el reporte no va a la cola offline.
  it.each([
    [503, 'Hay muchas fotos procesandose en este momento. Intenta de nuevo en unos segundos.'],
    [409, 'Formato de foto no permitido: el archivo no es una imagen JPG, PNG o WEBP valida'],
    [413, 'La foto supera el tamaño máximo de 10 MB'],
  ])('un %i de la foto se muestra con el mensaje del API y no se encola', async (status, mensaje) => {
    vi.mocked(crearReporte).mockRejectedValue(new ApiError(status, mensaje, '/api/reportes'));
    const { result, enviar } = montar();

    expect(await enviar()).toBeNull();
    expect(result.current.error).toEqual({ mensaje, detalles: [] });
    expect(encolar).not.toHaveBeenCalled();

    // El reintento (p. ej. tras el 503) es el mismo intento lógico.
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

  it('NC-02: sin título válido o sin severidad no llega al backend', async () => {
    const { result, enviar } = montar();

    expect(await enviar({ ...DATOS, titulo: '   ' })).toBeNull();
    expect(result.current.error?.mensaje).toBe('Escribe un título para el reporte.');

    expect(await enviar({ ...DATOS, titulo: ' Hoyo ' })).toBeNull();
    expect(result.current.error?.mensaje).toMatch(/al menos 5/);

    expect(await enviar({ ...DATOS, severidad: null })).toBeNull();
    expect(result.current.error?.mensaje).toBe('Elige la severidad del daño.');

    expect(crearReporte).not.toHaveBeenCalled();
  });

  it('NC-02: el largo se cuenta en caracteres, como el backend (un emoji es 1)', async () => {
    vi.mocked(crearReporte).mockResolvedValue(CREADO);
    const { enviar } = montar();

    // 4 letras + 1 emoji = 5 caracteres (y 6 unidades UTF-16).
    expect(await enviar({ ...DATOS, titulo: 'Hoyo😀' })).toEqual({ tipo: 'creado', reporte: CREADO });
    expect(crearReporte).toHaveBeenCalledWith(expect.objectContaining({ titulo: 'Hoyo😀' }));
  });
});

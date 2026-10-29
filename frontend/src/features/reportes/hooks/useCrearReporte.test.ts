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

    expect(await enviar()).toEqual({ tipo: 'encolado', motivo: 'sin-conexion' });
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

describe('useCrearReporte: la moderación (NC-10c)', () => {
  const FOTO = new File(['x'], 'bache.jpg', { type: 'image/jpeg' });
  const CON_FOTO: DatosDelReporte = { ...DATOS, foto: FOTO };
  const SIN_SERVICIO =
    'No pudimos revisar la foto en este momento. Guarda el reporte para enviarlo después o envíalo sin foto.';
  const DESCRIPCION_RECHAZADA =
    'La descripción tiene palabras que no están permitidas. Cámbiala para continuar.';

  const fotoNoPermitida = () =>
    new ApiError(400, 'La foto no está permitida. Toma otra.', '/api/reportes', ['foto'], 'FOTO_NO_PERMITIDA');
  const textoNoPermitido = (campo: string, mensaje: string) =>
    new ApiError(400, mensaje, '/api/reportes', [campo], 'TEXTO_NO_PERMITIDO');
  const moderacionCaida = () =>
    new ApiError(503, SIN_SERVICIO, '/api/reportes', [], 'MODERACION_NO_DISPONIBLE');

  it('400 FOTO_NO_PERMITIDA: lo devuelve para quitar la foto, sin error general ni cola', async () => {
    vi.mocked(crearReporte).mockRejectedValueOnce(fotoNoPermitida()).mockResolvedValueOnce(CREADO);
    const { result, enviar } = montar();

    expect(await enviar(CON_FOTO)).toEqual({ tipo: 'foto-no-permitida' });
    expect(result.current.error).toBeNull();
    expect(result.current.textoRechazado).toBeNull();
    expect(encolar).not.toHaveBeenCalled();

    // Reenviado sin la foto, es el mismo intento: la misma clave.
    expect(await enviar(DATOS)).toEqual({ tipo: 'creado', reporte: CREADO });
    expect(claveDe(1)).toBe(claveDe(0));
  });

  it.each([
    ['titulo', 'El título tiene palabras que no están permitidas. Cámbialo para continuar.', DATOS.titulo],
    ['descripcion', DESCRIPCION_RECHAZADA, DATOS.descripcion],
  ])('400 TEXTO_NO_PERMITIDO en %s: queda para el campo, con lo que se envió', async (campo, mensaje, valor) => {
    vi.mocked(crearReporte).mockRejectedValue(textoNoPermitido(campo, mensaje));
    const { result, enviar } = montar();

    expect(await enviar()).toBeNull();
    expect(result.current.textoRechazado).toEqual({ campo, mensaje, valor });
    expect(result.current.error).toBeNull();
    expect(encolar).not.toHaveBeenCalled();
  });

  it('un campo que el formulario no tiene va como error general, sin el nombre del campo', async () => {
    vi.mocked(crearReporte).mockRejectedValue(textoNoPermitido('contenido', 'El comentario tiene palabras…'));
    const { result, enviar } = montar();

    expect(await enviar()).toBeNull();
    expect(result.current.textoRechazado).toBeNull();
    expect(result.current.error).toEqual({ mensaje: 'El comentario tiene palabras…', detalles: [] });
  });

  it('el siguiente envío borra el texto rechazado anterior', async () => {
    vi.mocked(crearReporte)
      .mockRejectedValueOnce(textoNoPermitido('descripcion', DESCRIPCION_RECHAZADA))
      .mockResolvedValueOnce(CREADO);
    const { result, enviar } = montar();
    await enviar();

    await enviar({ ...DATOS, descripcion: 'Bache hondo' });

    expect(result.current.textoRechazado).toBeNull();
  });

  it('503 MODERACION_NO_DISPONIBLE con foto: ofrece las dos salidas y no encola solo', async () => {
    vi.mocked(crearReporte).mockRejectedValue(moderacionCaida());
    const { result, enviar } = montar();

    expect(await enviar(CON_FOTO)).toBeNull();
    expect(result.current.moderacionNoDisponible).toBe(SIN_SERVICIO);
    expect(result.current.error).toBeNull();
    expect(encolar).not.toHaveBeenCalled();
  });

  it('«Guardar para enviar después»: a la cola con la MISMA clave y la foto, sin otro POST', async () => {
    vi.mocked(crearReporte).mockRejectedValueOnce(moderacionCaida());
    encolar.mockResolvedValue(undefined);
    const { result, enviar } = montar();
    await enviar(CON_FOTO);

    let desenlace: DesenlaceDelEnvio = null;
    await act(async () => {
      desenlace = await result.current.guardarParaDespues(CON_FOTO);
    });

    expect(desenlace).toEqual({ tipo: 'encolado', motivo: 'moderacion-no-disponible' });
    expect(crearReporte).toHaveBeenCalledTimes(1);
    expect(encolar).toHaveBeenCalledWith(
      expect.objectContaining({ idempotencyKey: claveDe(0), foto: FOTO }),
    );
    expect(result.current.moderacionNoDisponible).toBeNull();

    // Ya en la cola: el siguiente reporte es otro intento.
    vi.mocked(crearReporte).mockResolvedValueOnce(CREADO);
    await enviar();
    expect(claveDe(1)).not.toBe(claveDe(0));
  });

  it('«Guardar para enviar después» sin IndexedDB avisa y conserva la clave', async () => {
    vi.mocked(crearReporte).mockRejectedValueOnce(moderacionCaida()).mockResolvedValueOnce(CREADO);
    encolar.mockRejectedValue(new Error('sin IndexedDB'));
    const { result, enviar } = montar();
    await enviar(CON_FOTO);

    await act(async () => {
      expect(await result.current.guardarParaDespues(CON_FOTO)).toBeNull();
    });

    expect(result.current.error?.mensaje).toMatch(/No pudimos guardar el reporte en este dispositivo/);
    await enviar(DATOS);
    expect(claveDe(1)).toBe(claveDe(0));
  });

  it('«Enviar sin foto»: otro envío sin la foto y con la MISMA clave', async () => {
    vi.mocked(crearReporte).mockRejectedValueOnce(moderacionCaida()).mockResolvedValueOnce(CREADO);
    const { result, enviar } = montar();
    await enviar(CON_FOTO);

    expect(await enviar({ ...CON_FOTO, foto: null })).toEqual({ tipo: 'creado', reporte: CREADO });
    expect(vi.mocked(crearReporte).mock.calls[1]?.[0].foto).toBeNull();
    expect(claveDe(1)).toBe(claveDe(0));
    expect(result.current.moderacionNoDisponible).toBeNull();
  });

  it('un 503 sin código (almacenamiento o saneado) sigue siendo un error común', async () => {
    vi.mocked(crearReporte).mockRejectedValue(new ApiError(503, 'Sin almacenamiento', '/api/reportes'));
    const { result, enviar } = montar();

    expect(await enviar(CON_FOTO)).toBeNull();
    expect(result.current.moderacionNoDisponible).toBeNull();
    expect(result.current.error?.mensaje).toBe('Sin almacenamiento');
  });

  it('limpiarError (un error de campo corta el envío) también cierra las salidas del 503', async () => {
    vi.mocked(crearReporte).mockRejectedValue(moderacionCaida());
    const { result, enviar } = montar();
    await enviar(CON_FOTO);

    act(() => result.current.limpiarError());

    expect(result.current.moderacionNoDisponible).toBeNull();
  });
});

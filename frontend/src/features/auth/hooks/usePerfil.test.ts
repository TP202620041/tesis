import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { listarDistritos } from '@/lib/api/catalogos';
import { ApiError, NetworkError } from '@/lib/api/errors';
import type { Distrito, Usuario } from '@/lib/types/domain';
import { actualizarPreferenciaNotificacion, editarPerfil } from '../api';
import { useDistritosDeResidencia, usePerfil } from './usePerfil';

vi.mock('../api', () => ({ actualizarPreferenciaNotificacion: vi.fn(), editarPerfil: vi.fn() }));
vi.mock('@/lib/api/catalogos', () => ({ listarDistritos: vi.fn() }));

const ANA: Usuario = {
  id: 1,
  email: 'ana@lima.pe',
  nombre: 'Ana',
  apellido: 'Vecina',
  rol: 'CIUDADANO',
  preferenciaNotificacion: 'EMAIL',
  debeAceptarTerminos: false,
};

afterEach(() => {
  vi.mocked(editarPerfil).mockReset();
  vi.mocked(actualizarPreferenciaNotificacion).mockReset();
  vi.mocked(listarDistritos).mockReset();
});

describe('usePerfil', () => {
  it('guardar actualiza el usuario con la respuesta y marca guardado', async () => {
    vi.mocked(editarPerfil).mockResolvedValue({ ...ANA, nombre: 'Ana María' });
    const { result } = renderHook(() => usePerfil(ANA));

    let ok = false;
    await act(async () => {
      ok = await result.current.guardar({ nombre: 'Ana María', apellido: 'Vecina' });
    });

    expect(ok).toBe(true);
    expect(result.current.usuario.nombre).toBe('Ana María');
    expect(result.current.guardado).toBe(true);
    expect(result.current.guardando).toBe(false);
  });

  it('un 400 se muestra con su detalle y guardar devuelve false', async () => {
    vi.mocked(editarPerfil).mockRejectedValue(
      new ApiError(400, 'Datos inválidos', '/api/auth/me', ['nombre: obligatorio']),
    );
    const { result } = renderHook(() => usePerfil(ANA));

    let ok = true;
    await act(async () => {
      ok = await result.current.guardar({ nombre: '' });
    });

    expect(ok).toBe(false);
    expect(result.current.error).toEqual({
      mensaje: 'Datos inválidos',
      detalles: ['nombre: obligatorio'],
    });
    expect(result.current.guardado).toBe(false);
  });

  // DEP-11/DEP-12: respuestas del saneado de la foto de perfil.
  it.each([
    [503, 'Hay muchas fotos procesandose en este momento. Intenta de nuevo en unos segundos.'],
    [409, 'Formato de foto no permitido: el archivo no es una imagen JPG, PNG o WEBP valida'],
    [413, 'La foto supera el tamaño máximo de 10 MB'],
  ])('un %i de la foto se muestra con el mensaje del API', async (status, mensaje) => {
    vi.mocked(editarPerfil).mockRejectedValue(new ApiError(status, mensaje, '/api/auth/me'));
    const { result } = renderHook(() => usePerfil(ANA));
    const foto = new File(['x'], 'perfil.jpg', { type: 'image/jpeg' });

    let ok = true;
    await act(async () => {
      ok = await result.current.guardar({ nombre: 'Ana', foto });
    });

    expect(ok).toBe(false);
    expect(result.current.error).toEqual({ mensaje, detalles: [] });
    expect(result.current.guardado).toBe(false);
  });

  it('NC-10c: un 400 TEXTO_NO_PERMITIDO queda para el campo, con lo enviado, y no en error', async () => {
    const mensaje = 'El apellido tiene palabras que no están permitidas. Cámbialo para continuar.';
    vi.mocked(editarPerfil).mockRejectedValueOnce(
      new ApiError(400, mensaje, '/api/auth/me', ['apellido'], 'TEXTO_NO_PERMITIDO'),
    );
    const { result } = renderHook(() => usePerfil(ANA));

    let ok = true;
    await act(async () => {
      ok = await result.current.guardar({ nombre: 'Ana', apellido: 'Vecina fea' });
    });

    expect(ok).toBe(false);
    expect(result.current.textoRechazado).toEqual({ campo: 'apellido', mensaje, valor: 'Vecina fea' });
    expect(result.current.error).toBeNull();
    expect(result.current.guardado).toBe(false);

    vi.mocked(editarPerfil).mockResolvedValueOnce(ANA);
    await act(async () => {
      await result.current.guardar({ nombre: 'Ana', apellido: 'Vecina' });
    });
    expect(result.current.textoRechazado).toBeNull();
  });

  it('sin conexion conserva el texto de la pantalla', async () => {
    vi.mocked(actualizarPreferenciaNotificacion).mockRejectedValue(new NetworkError());
    const { result } = renderHook(() => usePerfil(ANA));

    await act(async () => {
      await result.current.cambiarPreferencia('AMBAS');
    });

    expect(result.current.error).toEqual({ mensaje: 'Sin conexión con el servidor.', detalles: [] });
    expect(result.current.usuario.preferenciaNotificacion).toBe('EMAIL');
  });

  it('cambiarPreferencia guarda al instante', async () => {
    vi.mocked(actualizarPreferenciaNotificacion).mockResolvedValue({
      ...ANA,
      preferenciaNotificacion: 'AMBAS',
    });
    const { result } = renderHook(() => usePerfil(ANA));

    await act(async () => {
      await result.current.cambiarPreferencia('AMBAS');
    });

    expect(actualizarPreferenciaNotificacion).toHaveBeenCalledWith('AMBAS');
    expect(result.current.usuario.preferenciaNotificacion).toBe('AMBAS');
  });
});

describe('useDistritosDeResidencia', () => {
  it('trae los distritos; si falla queda vacio', async () => {
    const miraflores = { id: 1, nombre: 'Miraflores' } as Distrito;
    vi.mocked(listarDistritos).mockResolvedValueOnce([miraflores]);
    const { result } = renderHook(() => useDistritosDeResidencia());
    await waitFor(() => expect(result.current).toEqual([miraflores]));

    vi.mocked(listarDistritos).mockRejectedValueOnce(new NetworkError());
    const otro = renderHook(() => useDistritosDeResidencia());
    await waitFor(() => expect(listarDistritos).toHaveBeenCalledTimes(2));
    expect(otro.result.current).toEqual([]);
  });
});

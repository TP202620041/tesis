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

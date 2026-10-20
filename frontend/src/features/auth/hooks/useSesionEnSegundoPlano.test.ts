import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { ApiError, NetworkError } from '@/lib/api/errors';
import { borrarToken, generacionDeSesion, guardarToken } from '@/lib/auth/token-storage';
import type { Usuario } from '@/lib/types/domain';
import { usuarioActualSinRedirigir } from '../api';
import {
  MAXIMO_DE_REINTENTOS,
  useHaySesion,
  useIdentidadEnSegundoPlano,
} from './useSesionEnSegundoPlano';

vi.mock('../api', () => ({ usuarioActualSinRedirigir: vi.fn() }));

const ANA = {
  id: 7,
  email: 'ana@lima.pe',
  nombre: 'Ana',
  apellido: 'Vecina',
  rol: 'CIUDADANO',
  preferenciaNotificacion: 'EMAIL',
  debeAceptarTerminos: false,
} as Usuario;

afterEach(() => {
  borrarToken();
  vi.mocked(usuarioActualSinRedirigir).mockReset();
});

describe('useHaySesion', () => {
  it('se actualiza al iniciar y cerrar sesion', () => {
    const { result } = renderHook(() => useHaySesion());
    expect(result.current).toBe(false);

    act(() => guardarToken('t'));
    expect(result.current).toBe(true);

    act(() => borrarToken());
    expect(result.current).toBe(false);
  });
});

describe('useIdentidadEnSegundoPlano', () => {
  it('sin token es null y no consulta /me', async () => {
    const { result } = renderHook(() => useIdentidadEnSegundoPlano());

    await waitFor(() => expect(result.current).toBeNull());
    expect(usuarioActualSinRedirigir).not.toHaveBeenCalled();
  });

  it('devuelve el usuario con la generacion en que se identifico', async () => {
    guardarToken('t1');
    const generacion = generacionDeSesion();
    vi.mocked(usuarioActualSinRedirigir).mockResolvedValue(ANA);
    const { result } = renderHook(() => useIdentidadEnSegundoPlano());

    await waitFor(() => expect(result.current).toEqual({ usuario: ANA, generacion }));
  });

  it('consulta /me una vez por sesion y otra vez solo si la sesion cambia', async () => {
    guardarToken('t1');
    vi.mocked(usuarioActualSinRedirigir).mockResolvedValue(ANA);
    const { result, rerender } = renderHook(() => useIdentidadEnSegundoPlano());
    await waitFor(() => expect(result.current?.usuario).toEqual(ANA));

    rerender();
    rerender();
    expect(usuarioActualSinRedirigir).toHaveBeenCalledTimes(1);

    act(() => guardarToken('t2'));
    await waitFor(() => expect(usuarioActualSinRedirigir).toHaveBeenCalledTimes(2));
  });

  it('ante un 5xx reintenta solo, con espera creciente y hasta un tope', async () => {
    guardarToken('t1');
    vi.mocked(usuarioActualSinRedirigir).mockRejectedValue(new ApiError(503, 'No disponible'));
    const { result, unmount } = renderHook(() =>
      useIdentidadEnSegundoPlano({ esperaInicialMs: 5 }),
    );

    // 1 consulta inicial + MAXIMO_DE_REINTENTOS reintentos automaticos.
    await waitFor(
      () => expect(usuarioActualSinRedirigir).toHaveBeenCalledTimes(1 + MAXIMO_DE_REINTENTOS),
      { timeout: 2000 },
    );
    await new Promise((r) => setTimeout(r, 300));
    expect(usuarioActualSinRedirigir).toHaveBeenCalledTimes(1 + MAXIMO_DE_REINTENTOS);
    expect(result.current).toBeUndefined();
    unmount();
  });

  it('el reintento automatico identifica al usuario cuando /me se recupera', async () => {
    guardarToken('t1');
    vi.mocked(usuarioActualSinRedirigir)
      .mockRejectedValueOnce(new ApiError(500, 'Fallo'))
      .mockResolvedValue(ANA);
    const { result } = renderHook(() => useIdentidadEnSegundoPlano({ esperaInicialMs: 5 }));

    await waitFor(() => expect(result.current?.usuario).toEqual(ANA));
    expect(usuarioActualSinRedirigir).toHaveBeenCalledTimes(2);
  });

  it('al desmontarse no queda ningun reintento programado', async () => {
    guardarToken('t1');
    vi.mocked(usuarioActualSinRedirigir).mockRejectedValue(new ApiError(503, 'No disponible'));
    const { unmount } = renderHook(() => useIdentidadEnSegundoPlano({ esperaInicialMs: 50 }));
    await waitFor(() => expect(usuarioActualSinRedirigir).toHaveBeenCalledTimes(1));

    unmount();
    await new Promise((r) => setTimeout(r, 150));

    expect(usuarioActualSinRedirigir).toHaveBeenCalledTimes(1);
  });

  it('si /me falla por red queda "sin saber" y reintenta al volver la conexion', async () => {
    guardarToken('t1');
    vi.mocked(usuarioActualSinRedirigir)
      .mockRejectedValueOnce(new NetworkError())
      .mockResolvedValueOnce(ANA);
    const { result } = renderHook(() => useIdentidadEnSegundoPlano());
    await waitFor(() => expect(usuarioActualSinRedirigir).toHaveBeenCalledTimes(1));
    expect(result.current).toBeUndefined();
    // Que el fallo ya se haya procesado (y el listener de `online` exista).
    await new Promise((r) => setTimeout(r, 50));

    act(() => {
      window.dispatchEvent(new Event('online'));
    });

    await waitFor(() => expect(result.current?.usuario).toEqual(ANA));
  });
});

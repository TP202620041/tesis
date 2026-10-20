import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { borrarToken, guardarToken } from '@/lib/auth/token-storage';
import type { Usuario } from '@/lib/types/domain';
import { usuarioActualSinRedirigir } from '../api';
import { useHaySesion, useUsuarioEnSegundoPlano } from './useSesionEnSegundoPlano';

vi.mock('../api', () => ({ usuarioActualSinRedirigir: vi.fn() }));

const ANA = {
  id: 7,
  email: 'ana@lima.pe',
  nombre: 'Ana',
  apellido: 'Vecina',
  rol: 'CIUDADANO',
  preferenciaNotificacion: 'EMAIL',
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

describe('useUsuarioEnSegundoPlano', () => {
  it('sin token es null y no consulta /me', async () => {
    const { result } = renderHook(() => useUsuarioEnSegundoPlano());

    await waitFor(() => expect(result.current).toBeNull());
    expect(usuarioActualSinRedirigir).not.toHaveBeenCalled();
  });

  it('consulta /me una vez por sesion y otra vez solo si la sesion cambia', async () => {
    guardarToken('t1');
    vi.mocked(usuarioActualSinRedirigir).mockResolvedValue(ANA);
    const { result, rerender } = renderHook(() => useUsuarioEnSegundoPlano());
    await waitFor(() => expect(result.current).toEqual(ANA));

    rerender();
    rerender();
    expect(usuarioActualSinRedirigir).toHaveBeenCalledTimes(1);

    act(() => guardarToken('t2'));
    await waitFor(() => expect(usuarioActualSinRedirigir).toHaveBeenCalledTimes(2));
  });
});

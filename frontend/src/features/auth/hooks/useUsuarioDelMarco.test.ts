import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { NetworkError } from '@/lib/api/errors';
import { borrarToken, guardarToken } from '@/lib/auth/token-storage';
import type { Usuario } from '@/lib/types/domain';
import { usuarioActualSinRedirigir } from '../api';
import { useUsuarioDelMarco } from './useUsuarioDelMarco';

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

describe('useUsuarioDelMarco (DIS-1)', () => {
  it('sin token es visitante y no pregunta /me', async () => {
    const { result } = renderHook(() => useUsuarioDelMarco());
    await waitFor(() => expect(result.current).toEqual({ estado: 'visitante' }));
    expect(usuarioActualSinRedirigir).not.toHaveBeenCalled();
  });

  it('con sesión, identifica al usuario', async () => {
    guardarToken('t');
    vi.mocked(usuarioActualSinRedirigir).mockResolvedValue(ANA);
    const { result } = renderHook(() => useUsuarioDelMarco());
    await waitFor(() => expect(result.current).toEqual({ estado: 'identificado', usuario: ANA }));
  });

  it('un token vencido (401: /me devuelve null) deja al visitante, sin llevar al login', async () => {
    guardarToken('vencido');
    vi.mocked(usuarioActualSinRedirigir).mockResolvedValue(null);
    const { result } = renderHook(() => useUsuarioDelMarco());
    await waitFor(() => expect(result.current).toEqual({ estado: 'visitante' }));
  });

  it('sin red no da la sesión por perdida y reintenta al volver la conexión', async () => {
    guardarToken('t');
    vi.mocked(usuarioActualSinRedirigir).mockRejectedValueOnce(new NetworkError());
    const { result } = renderHook(() => useUsuarioDelMarco());
    await waitFor(() => expect(result.current).toEqual({ estado: 'sin-identificar' }));

    vi.mocked(usuarioActualSinRedirigir).mockResolvedValue(ANA);
    act(() => {
      window.dispatchEvent(new Event('online'));
    });
    await waitFor(() => expect(result.current).toEqual({ estado: 'identificado', usuario: ANA }));
  });

  it('al cerrar sesión pasa a visitante; al entrar otra persona, la identifica', async () => {
    guardarToken('t1');
    vi.mocked(usuarioActualSinRedirigir).mockResolvedValue(ANA);
    const { result } = renderHook(() => useUsuarioDelMarco());
    await waitFor(() => expect(result.current.estado).toBe('identificado'));

    act(() => borrarToken());
    await waitFor(() => expect(result.current).toEqual({ estado: 'visitante' }));

    const LUIS = { ...ANA, id: 8, nombre: 'Luis', rol: 'FUNCIONARIO_MUNICIPAL' } as Usuario;
    vi.mocked(usuarioActualSinRedirigir).mockResolvedValue(LUIS);
    act(() => guardarToken('t2'));
    await waitFor(() => expect(result.current).toEqual({ estado: 'identificado', usuario: LUIS }));
  });
});

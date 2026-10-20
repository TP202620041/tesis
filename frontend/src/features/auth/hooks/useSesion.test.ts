import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { NetworkError } from '@/lib/api/errors';
import { haySesion } from '@/lib/auth/token-storage';
import type { Usuario } from '@/lib/types/domain';
import { obtenerUsuarioActual } from '../api';
import { useSesion } from './useSesion';

vi.mock('../api', () => ({ obtenerUsuarioActual: vi.fn() }));
vi.mock('@/lib/auth/token-storage', () => ({ haySesion: vi.fn() }));

const USUARIO: Usuario = {
  id: 1,
  email: 'ana@lima.pe',
  nombre: 'Ana',
  apellido: 'Vecina',
  rol: 'CIUDADANO',
  preferenciaNotificacion: 'EMAIL',
};

afterEach(() => {
  vi.mocked(obtenerUsuarioActual).mockReset();
  vi.mocked(haySesion).mockReset();
});

describe('useSesion', () => {
  it('sin token queda anonimo y no consulta al backend', async () => {
    vi.mocked(haySesion).mockReturnValue(false);
    const { result } = renderHook(() => useSesion());

    expect(result.current.estado).toBe('cargando');
    await waitFor(() => expect(result.current.estado).toBe('anonimo'));
    expect(obtenerUsuarioActual).not.toHaveBeenCalled();
  });

  it('con token valido queda autenticado con el usuario de /me', async () => {
    vi.mocked(haySesion).mockReturnValue(true);
    vi.mocked(obtenerUsuarioActual).mockResolvedValue(USUARIO);
    const { result } = renderHook(() => useSesion());

    await waitFor(() => expect(result.current.estado).toBe('autenticado'));
    expect(result.current).toMatchObject({ usuario: USUARIO });
  });

  it('un fallo de /me cuenta como anonimo, no como error', async () => {
    vi.mocked(haySesion).mockReturnValue(true);
    vi.mocked(obtenerUsuarioActual).mockRejectedValue(new NetworkError());
    const { result } = renderHook(() => useSesion());

    await waitFor(() => expect(result.current.estado).toBe('anonimo'));
  });

  it('refrescar vuelve a consultar sin pasar por cargando', async () => {
    vi.mocked(haySesion).mockReturnValue(true);
    vi.mocked(obtenerUsuarioActual)
      .mockResolvedValueOnce(USUARIO)
      .mockResolvedValueOnce({ ...USUARIO, nombre: 'Ana María' });
    const { result } = renderHook(() => useSesion());
    await waitFor(() => expect(result.current.estado).toBe('autenticado'));

    act(() => result.current.refrescar());

    expect(result.current.estado).toBe('autenticado');
    await waitFor(() => expect(result.current).toMatchObject({ usuario: { nombre: 'Ana María' } }));
    expect(obtenerUsuarioActual).toHaveBeenCalledTimes(2);
  });
});

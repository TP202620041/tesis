import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { distritoPorCoordenadas } from '@/lib/api/catalogos';
import { NetworkError } from '@/lib/api/errors';
import type { Distrito } from '@/lib/types/domain';
import { useDistritoDeUbicacion } from './useDistritoDeUbicacion';

vi.mock('@/lib/api/catalogos', () => ({ distritoPorCoordenadas: vi.fn() }));

const PUNTO = { latitud: -12.12, longitud: -77.03 };
const MIRAFLORES = { id: 1, nombre: 'Miraflores' } as Distrito;

afterEach(() => {
  vi.mocked(distritoPorCoordenadas).mockReset();
});

describe('useDistritoDeUbicacion', () => {
  it('resuelve el distrito del punto y marca resolviendo mientras tanto', async () => {
    let responder!: (d: Distrito) => void;
    vi.mocked(distritoPorCoordenadas).mockReturnValue(new Promise((r) => (responder = r)));
    const { result } = renderHook(() => useDistritoDeUbicacion());

    let promesa!: Promise<Distrito | null>;
    act(() => {
      promesa = result.current.resolver(PUNTO);
    });
    await waitFor(() => expect(result.current.resolviendo).toBe(true));
    await act(async () => {
      responder(MIRAFLORES);
    });

    await expect(promesa).resolves.toBe(MIRAFLORES);
    expect(result.current.resolviendo).toBe(false);
    expect(distritoPorCoordenadas).toHaveBeenCalledWith(-12.12, -77.03);
  });

  it('fuera de cobertura devuelve null', async () => {
    vi.mocked(distritoPorCoordenadas).mockResolvedValue(null);
    const { result } = renderHook(() => useDistritoDeUbicacion());

    let distrito: Distrito | null | undefined;
    await act(async () => {
      distrito = await result.current.resolver(PUNTO);
    });
    expect(distrito).toBeNull();
  });

  it('un fallo de red no rechaza: devuelve null para no impedir reportar', async () => {
    vi.mocked(distritoPorCoordenadas).mockRejectedValue(new NetworkError());
    const { result } = renderHook(() => useDistritoDeUbicacion());

    let distrito: Distrito | null | undefined;
    await act(async () => {
      distrito = await result.current.resolver(PUNTO);
    });
    expect(distrito).toBeNull();
    expect(result.current.resolviendo).toBe(false);
  });
});

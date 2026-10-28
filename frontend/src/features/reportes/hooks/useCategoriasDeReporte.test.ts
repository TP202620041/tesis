import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { listarCategorias } from '@/lib/api/catalogos';
import { NetworkError } from '@/lib/api/errors';
import type { CategoriaDano } from '@/lib/types/domain';
import { useCategoriasDeReporte } from './useCategoriasDeReporte';

vi.mock('@/lib/api/catalogos', () => ({ listarCategorias: vi.fn() }));

const BACHE = { id: 1, nombre: 'Bache', esEstandar: true } as CategoriaDano;

afterEach(() => {
  vi.mocked(listarCategorias).mockReset();
});

describe('useCategoriasDeReporte (US-29, NC-04)', () => {
  it('mientras carga, la lista está vacía y lo dice', () => {
    vi.mocked(listarCategorias).mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useCategoriasDeReporte(null));
    expect(result.current).toEqual({ categorias: [], estado: 'cargando' });
  });

  it('pide las del distrito y las entrega', async () => {
    vi.mocked(listarCategorias).mockResolvedValue([BACHE]);
    const { result } = renderHook(() => useCategoriasDeReporte(15));
    await waitFor(() => expect(result.current.estado).toBe('listo'));
    expect(result.current.categorias).toEqual([BACHE]);
    expect(listarCategorias).toHaveBeenCalledWith(15);
  });

  it('si falla, la lista queda vacía como antes, pero se distingue de «cargando»', async () => {
    vi.mocked(listarCategorias).mockRejectedValue(new NetworkError());
    const { result } = renderHook(() => useCategoriasDeReporte(null));
    await waitFor(() => expect(result.current.estado).toBe('fallido'));
    expect(result.current.categorias).toEqual([]);
  });

  it('al cambiar el distrito vuelve a «cargando» hasta tener las nuevas', async () => {
    vi.mocked(listarCategorias).mockResolvedValueOnce([BACHE]).mockReturnValueOnce(new Promise(() => {}));
    const { result, rerender } = renderHook(({ d }: { d: number | null }) => useCategoriasDeReporte(d), {
      initialProps: { d: null as number | null },
    });
    await waitFor(() => expect(result.current.estado).toBe('listo'));

    rerender({ d: 15 });

    expect(result.current).toEqual({ categorias: [], estado: 'cargando' });
  });
});

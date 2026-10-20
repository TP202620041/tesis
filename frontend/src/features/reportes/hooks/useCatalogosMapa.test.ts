import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { listarCategorias, listarDistritos } from '@/lib/api/catalogos';
import { NetworkError } from '@/lib/api/errors';
import type { CategoriaDano, Distrito } from '@/lib/types/domain';
import { useCatalogosMapa } from './useCatalogosMapa';

vi.mock('@/lib/api/catalogos', () => ({ listarCategorias: vi.fn(), listarDistritos: vi.fn() }));

const MIRAFLORES = { id: 1, nombre: 'Miraflores' } as Distrito;
const BACHE = { id: 3, nombre: 'Bache' } as CategoriaDano;

afterEach(() => {
  vi.mocked(listarCategorias).mockReset();
  vi.mocked(listarDistritos).mockReset();
});

describe('useCatalogosMapa', () => {
  it('arranca vacio y luego trae distritos y categorias estandar', async () => {
    vi.mocked(listarDistritos).mockResolvedValue([MIRAFLORES]);
    vi.mocked(listarCategorias).mockResolvedValue([BACHE]);
    const { result } = renderHook(() => useCatalogosMapa());

    expect(result.current).toEqual({ distritos: [], categorias: [] });
    await waitFor(() => expect(result.current.distritos).toEqual([MIRAFLORES]));
    expect(result.current.categorias).toEqual([BACHE]);
    expect(listarCategorias).toHaveBeenCalledWith();
  });

  it('un catalogo que falla queda vacio sin afectar al otro', async () => {
    vi.mocked(listarDistritos).mockRejectedValue(new NetworkError());
    vi.mocked(listarCategorias).mockResolvedValue([BACHE]);
    const { result } = renderHook(() => useCatalogosMapa());

    await waitFor(() => expect(result.current.categorias).toEqual([BACHE]));
    expect(result.current.distritos).toEqual([]);
  });
});

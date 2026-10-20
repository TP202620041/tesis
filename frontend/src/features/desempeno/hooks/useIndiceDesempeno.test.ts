import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { listarCategorias } from '@/lib/api/catalogos';
import { ApiError } from '@/lib/api/errors';
import type { CategoriaDano } from '@/lib/types/domain';
import { rankingDistrital } from '../api';
import type { DesempenoDistrital } from '../model/formato';
import { useCategoriasDelIndice, useRankingDistrital } from './useIndiceDesempeno';

vi.mock('../api', () => ({ rankingDistrital: vi.fn() }));
vi.mock('@/lib/api/catalogos', () => ({ listarCategorias: vi.fn() }));

const FILA = { distritoId: 1, distritoNombre: 'Miraflores', totalReportes: 3 } as DesempenoDistrital;

afterEach(() => {
  vi.mocked(rankingDistrital).mockReset();
  vi.mocked(listarCategorias).mockReset();
});

describe('useRankingDistrital', () => {
  it('pide el ranking de la categoria y lo vuelve a pedir al cambiarla', async () => {
    vi.mocked(rankingDistrital).mockResolvedValue([FILA]);
    const { result, rerender } = renderHook(({ c }) => useRankingDistrital(c), {
      initialProps: { c: null as number | null },
    });
    await waitFor(() => expect(result.current.datos).toEqual([FILA]));
    expect(rankingDistrital).toHaveBeenCalledWith(null);

    rerender({ c: 3 });

    await waitFor(() => expect(rankingDistrital).toHaveBeenLastCalledWith(3));
  });

  it('un fallo deja la carga en error', async () => {
    vi.mocked(rankingDistrital).mockRejectedValue(new ApiError(500, 'Fallo'));
    const { result } = renderHook(() => useRankingDistrital(null));

    await waitFor(() => expect(result.current.estado).toBe('error'));
  });
});

describe('useCategoriasDelIndice', () => {
  it('trae las categorias estandar; si falla queda vacio', async () => {
    const bache = { id: 3, nombre: 'Bache' } as CategoriaDano;
    vi.mocked(listarCategorias).mockResolvedValueOnce([bache]);
    const { result } = renderHook(() => useCategoriasDelIndice());
    await waitFor(() => expect(result.current).toEqual([bache]));
    expect(listarCategorias).toHaveBeenCalledWith();

    vi.mocked(listarCategorias).mockRejectedValueOnce(new ApiError(500, 'Fallo'));
    const otro = renderHook(() => useCategoriasDelIndice());
    await waitFor(() => expect(listarCategorias).toHaveBeenCalledTimes(2));
    expect(otro.result.current).toEqual([]);
  });
});

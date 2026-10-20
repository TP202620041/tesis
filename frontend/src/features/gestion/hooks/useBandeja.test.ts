import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { listarCategorias } from '@/lib/api/catalogos';
import { ApiError } from '@/lib/api/errors';
import type { CategoriaDano } from '@/lib/types/domain';
import { bandeja } from '../api';
import { FILTROS_BANDEJA_VACIOS, type ReporteGestion } from '../model/tipos';
import { useBandeja, useCategoriasDelDistrito } from './useBandeja';

vi.mock('../api', () => ({ bandeja: vi.fn() }));
vi.mock('@/lib/api/catalogos', () => ({ listarCategorias: vi.fn() }));

const REPORTE = { id: 4, estado: 'RECIBIDO' } as ReporteGestion;
const PROPIA = { id: 12, nombre: 'Poste caído' } as CategoriaDano;

afterEach(() => {
  vi.mocked(bandeja).mockReset();
  vi.mocked(listarCategorias).mockReset();
});

describe('useBandeja', () => {
  it('carga la bandeja con los filtros y vuelve a cargar si cambian', async () => {
    vi.mocked(bandeja).mockResolvedValue([REPORTE]);
    const { result, rerender } = renderHook(({ f }) => useBandeja(f), {
      initialProps: { f: FILTROS_BANDEJA_VACIOS },
    });
    await waitFor(() => expect(result.current.datos).toEqual([REPORTE]));

    const conEstado = { ...FILTROS_BANDEJA_VACIOS, estado: 'RECIBIDO' };
    rerender({ f: conEstado });

    await waitFor(() => expect(bandeja).toHaveBeenCalledTimes(2));
    expect(bandeja).toHaveBeenLastCalledWith(conEstado);
  });

  it('un fallo deja la carga en error', async () => {
    vi.mocked(bandeja).mockRejectedValue(new ApiError(500, 'Fallo'));
    const { result } = renderHook(() => useBandeja(FILTROS_BANDEJA_VACIOS));

    await waitFor(() => expect(result.current.estado).toBe('error'));
  });
});

describe('useCategoriasDelDistrito', () => {
  it('pide las categorias del distrito del funcionario (US-29)', async () => {
    vi.mocked(listarCategorias).mockResolvedValue([PROPIA]);
    const { result } = renderHook(() => useCategoriasDelDistrito(7));

    expect(result.current).toEqual([]);
    await waitFor(() => expect(result.current).toEqual([PROPIA]));
    expect(listarCategorias).toHaveBeenCalledWith(7);
  });

  it('si falla, el filtro queda sin categorias', async () => {
    vi.mocked(listarCategorias).mockRejectedValue(new ApiError(500, 'Fallo'));
    const { result } = renderHook(() => useCategoriasDelDistrito(null));

    await waitFor(() => expect(listarCategorias).toHaveBeenCalledWith(null));
    expect(result.current).toEqual([]);
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { listarCategorias } from '@/lib/api/catalogos';
import { ApiError } from '@/lib/api/errors';
import type { CategoriaDano } from '@/lib/types/domain';
import { dashboardDeGestion, listarPeriodosDeGestion } from '../api';
import type { DashboardGestion } from '../model/gestion';
import { useCategoriasDelIndice, useDashboardDeGestion, usePeriodosDeGestion } from './useIndiceDesempeno';

vi.mock('../api', () => ({ dashboardDeGestion: vi.fn(), listarPeriodosDeGestion: vi.fn() }));
vi.mock('@/lib/api/catalogos', () => ({ listarCategorias: vi.fn() }));

const DASHBOARD: DashboardGestion = {
  periodo: { id: 1, fechaInicio: '2023-01-01', fechaFin: '2026-12-31', vigente: true },
  categoriaId: null,
  calculatedAt: null,
  distritos: [],
};

afterEach(() => {
  vi.mocked(dashboardDeGestion).mockReset();
  vi.mocked(listarPeriodosDeGestion).mockReset();
  vi.mocked(listarCategorias).mockReset();
});

describe('useDashboardDeGestion (NC-06)', () => {
  it('pide el periodo y la categoría, y vuelve a pedir al cambiarlos', async () => {
    vi.mocked(dashboardDeGestion).mockResolvedValue(DASHBOARD);
    const { result, rerender } = renderHook(({ p, c }) => useDashboardDeGestion(p, c), {
      initialProps: { p: 1 as number | null, c: null as number | null },
    });
    await waitFor(() => expect(result.current.datos).toEqual(DASHBOARD));
    expect(dashboardDeGestion).toHaveBeenCalledWith(1, null);

    rerender({ p: 2, c: 3 });

    await waitFor(() => expect(dashboardDeGestion).toHaveBeenLastCalledWith(2, 3));
  });

  it('sin periodo no consulta: no pide «el vigente» a ciegas', async () => {
    const { result } = renderHook(() => useDashboardDeGestion(null, null));

    await waitFor(() => expect(result.current.estado).toBe('listo'));
    expect(result.current.datos).toBeNull();
    expect(dashboardDeGestion).not.toHaveBeenCalled();
  });

  it('un fallo deja la carga en error', async () => {
    vi.mocked(dashboardDeGestion).mockRejectedValue(new ApiError(500, 'Fallo'));
    const { result } = renderHook(() => useDashboardDeGestion(1, null));

    await waitFor(() => expect(result.current.estado).toBe('error'));
  });
});

describe('usePeriodosDeGestion', () => {
  it('trae los periodos', async () => {
    vi.mocked(listarPeriodosDeGestion).mockResolvedValue([DASHBOARD.periodo]);
    const { result } = renderHook(() => usePeriodosDeGestion());

    await waitFor(() => expect(result.current.datos).toEqual([DASHBOARD.periodo]));
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

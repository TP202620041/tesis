import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '@/lib/api/client';
import { dashboardDeGestion, listarPeriodosDeGestion } from './api';

vi.mock('@/lib/api/client', () => ({ api: { get: vi.fn().mockResolvedValue([]) } }));

afterEach(() => {
  vi.mocked(api.get).mockClear();
});

describe('API pública del desempeño por periodo (NC-06, OE3-I5)', () => {
  it('los periodos se piden sin token', async () => {
    await listarPeriodosDeGestion();
    expect(api.get).toHaveBeenCalledWith('/api/desempeno/periodos', { conAuth: false });
  });

  it('el dashboard se pide sin token y siempre con el periodo', async () => {
    await dashboardDeGestion(1);
    expect(api.get).toHaveBeenLastCalledWith('/api/desempeno/gestion?periodoId=1', { conAuth: false });

    await dashboardDeGestion(2, 3);
    expect(api.get).toHaveBeenLastCalledWith('/api/desempeno/gestion?periodoId=2&categoriaId=3', { conAuth: false });

    await dashboardDeGestion(2, null);
    expect(api.get).toHaveBeenLastCalledWith('/api/desempeno/gestion?periodoId=2', { conAuth: false });
  });
});

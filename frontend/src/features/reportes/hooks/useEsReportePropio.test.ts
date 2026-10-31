import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { misReportes } from '../api';
import type { ReporteResumen } from '../model/tipos';
import { useEsReportePropio } from './useEsReportePropio';

vi.mock('../api', () => ({ misReportes: vi.fn() }));

afterEach(() => {
  vi.mocked(misReportes).mockReset();
});

const MIOS = [{ id: 42 }, { id: 43 }] as ReporteResumen[];

describe('useEsReportePropio (NC-11b)', () => {
  it('es propio si está entre «mis reportes»; antes de saberlo, null', async () => {
    vi.mocked(misReportes).mockResolvedValue(MIOS);
    const { result } = renderHook(() => useEsReportePropio(42, true));
    expect(result.current).toBeNull();
    await waitFor(() => expect(result.current).toBe(true));
  });

  it('no es propio si no está en la lista', async () => {
    vi.mocked(misReportes).mockResolvedValue(MIOS);
    const { result } = renderHook(() => useEsReportePropio(99, true));
    await waitFor(() => expect(result.current).toBe(false));
  });

  it('si la consulta falla se asume ajeno: el 409 DENUNCIA_PROPIA lo dirá', async () => {
    vi.mocked(misReportes).mockRejectedValue(new Error('500'));
    const { result } = renderHook(() => useEsReportePropio(42, true));
    await waitFor(() => expect(result.current).toBe(false));
  });

  it('deshabilitado (sin sesión u otro rol) no consulta nada', async () => {
    const { result } = renderHook(() => useEsReportePropio(42, false));
    await waitFor(() => expect(result.current).toBe(false));
    expect(misReportes).not.toHaveBeenCalled();
  });
});

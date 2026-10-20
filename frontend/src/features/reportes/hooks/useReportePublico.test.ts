import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { NetworkError } from '@/lib/api/errors';
import { reportePorId } from '../api';
import type { ReporteResumen } from '../model/tipos';
import { useReportePublico } from './useReportePublico';

vi.mock('../api', () => ({ reportePorId: vi.fn() }));

afterEach(() => {
  vi.mocked(reportePorId).mockReset();
});

describe('useReportePublico', () => {
  it('trae el reporte por id', async () => {
    const reporte: ReporteResumen = { id: 5, estado: 'RESUELTO' };
    vi.mocked(reportePorId).mockResolvedValue(reporte);
    const { result } = renderHook(() => useReportePublico(5));

    await waitFor(() => expect(result.current.estado).toBe('listo'));
    expect(result.current.datos).toBe(reporte);
    expect(reportePorId).toHaveBeenCalledWith(5);
  });

  it('un 404 (null) no es error: es "no disponible"', async () => {
    vi.mocked(reportePorId).mockResolvedValue(null);
    const { result } = renderHook(() => useReportePublico(5));

    await waitFor(() => expect(result.current.estado).toBe('listo'));
    expect(result.current.datos).toBeNull();
  });

  it('un fallo de red deja la carga en error', async () => {
    vi.mocked(reportePorId).mockRejectedValue(new NetworkError());
    const { result } = renderHook(() => useReportePublico(5));

    await waitFor(() => expect(result.current.estado).toBe('error'));
  });
});

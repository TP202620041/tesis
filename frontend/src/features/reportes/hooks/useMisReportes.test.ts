import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { ApiError } from '@/lib/api/errors';
import { misReportes, pendientesDeCalificacion } from '../api';
import type { ReporteResumen } from '../model/tipos';
import { useMisReportes } from './useMisReportes';

vi.mock('../api', () => ({
  misReportes: vi.fn(),
  pendientesDeCalificacion: vi.fn(),
  colaDeReportes: { suscribir: () => () => {} },
}));

const PROPIO: ReporteResumen = { id: 1, estado: 'PENDIENTE', categoriaNombre: 'Bache' };
const RESUELTO: ReporteResumen = { id: 2, estado: 'RESUELTO', categoriaNombre: 'Bache' };

afterEach(() => {
  vi.mocked(misReportes).mockReset();
  vi.mocked(pendientesDeCalificacion).mockReset();
});

describe('useMisReportes', () => {
  it('devuelve los reportes y los pendientes de calificar', async () => {
    vi.mocked(misReportes).mockResolvedValue([PROPIO, RESUELTO]);
    vi.mocked(pendientesDeCalificacion).mockResolvedValue([RESUELTO]);
    const { result } = renderHook(() => useMisReportes());

    await waitFor(() => expect(result.current.estado).toBe('listo'));
    expect(result.current.datos).toEqual({ reportes: [PROPIO, RESUELTO], porCalificar: [RESUELTO] });
  });

  it('si falla el recordatorio, la lista se muestra igual sin aviso', async () => {
    vi.mocked(misReportes).mockResolvedValue([PROPIO]);
    vi.mocked(pendientesDeCalificacion).mockRejectedValue(new ApiError(500, 'Fallo'));
    const { result } = renderHook(() => useMisReportes());

    await waitFor(() => expect(result.current.estado).toBe('listo'));
    expect(result.current.datos).toEqual({ reportes: [PROPIO], porCalificar: [] });
  });

  it('si falla la lista principal queda en error', async () => {
    vi.mocked(misReportes).mockRejectedValue(new ApiError(500, 'Fallo'));
    vi.mocked(pendientesDeCalificacion).mockResolvedValue([]);
    const { result } = renderHook(() => useMisReportes());

    await waitFor(() => expect(result.current.estado).toBe('error'));
  });
});

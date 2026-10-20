import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { ApiError } from '@/lib/api/errors';
import type { HistorialEntrada } from '@/lib/types/domain';
import { historialDeReporte, misReportes } from '../api';
import type { ReporteResumen } from '../model/tipos';
import { useMiReporte } from './useMiReporte';

vi.mock('../api', () => ({ historialDeReporte: vi.fn(), misReportes: vi.fn() }));

const UNO: ReporteResumen = { id: 1, estado: 'PENDIENTE' };
const DOS: ReporteResumen = { id: 2, estado: 'RECIBIDO' };
const ENTRADA = { id: 9, tipoEvento: 'CAMBIO_ESTADO' } as HistorialEntrada;

afterEach(() => {
  vi.mocked(misReportes).mockReset();
  vi.mocked(historialDeReporte).mockReset();
});

describe('useMiReporte', () => {
  it('busca el reporte entre los propios y trae su historial', async () => {
    vi.mocked(misReportes).mockResolvedValue([UNO, DOS]);
    vi.mocked(historialDeReporte).mockResolvedValue([ENTRADA]);
    const { result } = renderHook(() => useMiReporte(2));

    await waitFor(() => expect(result.current.estado).toBe('listo'));
    expect(result.current.datos).toEqual({ reporte: DOS, entradas: [ENTRADA] });
    expect(historialDeReporte).toHaveBeenCalledWith(2);
  });

  it('si no esta entre los propios, el reporte es null', async () => {
    vi.mocked(misReportes).mockResolvedValue([UNO]);
    vi.mocked(historialDeReporte).mockResolvedValue([]);
    const { result } = renderHook(() => useMiReporte(99));

    await waitFor(() => expect(result.current.estado).toBe('listo'));
    expect(result.current.datos?.reporte).toBeNull();
  });

  it('un historial que falla se muestra vacio', async () => {
    vi.mocked(misReportes).mockResolvedValue([UNO]);
    vi.mocked(historialDeReporte).mockRejectedValue(new ApiError(403, 'Prohibido'));
    const { result } = renderHook(() => useMiReporte(1));

    await waitFor(() => expect(result.current.estado).toBe('listo'));
    expect(result.current.datos).toEqual({ reporte: UNO, entradas: [] });
  });
});

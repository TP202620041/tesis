import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
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
    expect(result.current.datos).toEqual({ reporte: DOS, entradas: [ENTRADA], errorDeRecarga: null });
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
    expect(result.current.datos).toEqual({ reporte: UNO, entradas: [], errorDeRecarga: null });
  });

  it('si falla una recarga conserva el reporte visible y avisa', async () => {
    vi.mocked(misReportes)
      .mockResolvedValueOnce([UNO])
      .mockRejectedValueOnce(new ApiError(500, 'Fallo del servidor'))
      .mockResolvedValueOnce([{ ...UNO, estado: 'CANCELADO' }]);
    vi.mocked(historialDeReporte).mockResolvedValue([ENTRADA]);
    const { result } = renderHook(() => useMiReporte(1));
    await waitFor(() => expect(result.current.estado).toBe('listo'));

    act(() => result.current.recargar());

    await waitFor(() => expect(result.current.datos?.errorDeRecarga).not.toBeNull());
    expect(result.current.estado).toBe('listo');
    expect(result.current.datos?.reporte).toEqual(UNO);
    expect(result.current.datos?.errorDeRecarga?.mensaje).toBe('Fallo del servidor');

    // Una recarga que vuelve a funcionar limpia el aviso.
    act(() => result.current.recargar());
    await waitFor(() => expect(result.current.datos?.reporte?.estado).toBe('CANCELADO'));
    expect(result.current.datos?.errorDeRecarga).toBeNull();
  });

  it('un fallo en la primera carga sigue siendo error (no hay datos que conservar)', async () => {
    vi.mocked(misReportes).mockRejectedValue(new ApiError(500, 'Fallo'));
    vi.mocked(historialDeReporte).mockResolvedValue([]);
    const { result } = renderHook(() => useMiReporte(1));

    await waitFor(() => expect(result.current.estado).toBe('error'));
  });
});

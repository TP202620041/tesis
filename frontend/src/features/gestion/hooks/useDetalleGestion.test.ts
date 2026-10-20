import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { ApiError, NetworkError } from '@/lib/api/errors';
import type { HistorialEntrada } from '@/lib/types/domain';
import { bandeja, historial } from '../api';
import { FILTROS_BANDEJA_VACIOS, type ReporteGestion } from '../model/tipos';
import { useDetalleGestion } from './useDetalleGestion';

vi.mock('../api', () => ({ bandeja: vi.fn(), historial: vi.fn() }));

const DEL_DISTRITO = { id: 4, estado: 'RECIBIDO' } as ReporteGestion;
const ENTRADA = { id: 1, tipoEvento: 'ASIGNACION' } as HistorialEntrada;

afterEach(() => {
  vi.mocked(bandeja).mockReset();
  vi.mocked(historial).mockReset();
});

describe('useDetalleGestion', () => {
  it('localiza el reporte en la bandeja completa y trae su historial', async () => {
    vi.mocked(bandeja).mockResolvedValue([DEL_DISTRITO]);
    vi.mocked(historial).mockResolvedValue([ENTRADA]);
    const { result } = renderHook(() => useDetalleGestion(4));

    await waitFor(() => expect(result.current.estado).toBe('listo'));
    expect(result.current.datos).toEqual({
      reporte: DEL_DISTRITO,
      entradas: [ENTRADA],
      errorDeRecarga: null,
    });
    expect(bandeja).toHaveBeenCalledWith(FILTROS_BANDEJA_VACIOS);
  });

  it('un reporte de otro distrito no aparece: reporte null', async () => {
    vi.mocked(bandeja).mockResolvedValue([DEL_DISTRITO]);
    vi.mocked(historial).mockRejectedValue(new ApiError(403, 'Prohibido'));
    const { result } = renderHook(() => useDetalleGestion(99));

    await waitFor(() => expect(result.current.estado).toBe('listo'));
    expect(result.current.datos).toEqual({ reporte: null, entradas: [], errorDeRecarga: null });
  });

  it('si falla la recarga tras cambiar el estado, conserva el reporte y avisa', async () => {
    vi.mocked(bandeja)
      .mockResolvedValueOnce([DEL_DISTRITO])
      .mockRejectedValueOnce(new NetworkError());
    vi.mocked(historial).mockResolvedValue([ENTRADA]);
    const { result } = renderHook(() => useDetalleGestion(4));
    await waitFor(() => expect(result.current.estado).toBe('listo'));

    act(() => result.current.recargar());

    await waitFor(() => expect(result.current.datos?.errorDeRecarga).not.toBeNull());
    expect(result.current.estado).toBe('listo');
    expect(result.current.datos?.reporte).toEqual(DEL_DISTRITO);
  });
});

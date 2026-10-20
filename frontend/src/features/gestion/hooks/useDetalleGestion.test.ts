import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { ApiError } from '@/lib/api/errors';
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
    expect(result.current.datos).toEqual({ reporte: DEL_DISTRITO, entradas: [ENTRADA] });
    expect(bandeja).toHaveBeenCalledWith(FILTROS_BANDEJA_VACIOS);
  });

  it('un reporte de otro distrito no aparece: reporte null', async () => {
    vi.mocked(bandeja).mockResolvedValue([DEL_DISTRITO]);
    vi.mocked(historial).mockRejectedValue(new ApiError(403, 'Prohibido'));
    const { result } = renderHook(() => useDetalleGestion(99));

    await waitFor(() => expect(result.current.estado).toBe('listo'));
    expect(result.current.datos).toEqual({ reporte: null, entradas: [] });
  });
});

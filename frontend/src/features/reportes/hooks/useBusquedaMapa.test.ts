import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { ApiError } from '@/lib/api/errors';
import { finDelDiaLocal, inicioDelDiaLocal } from '@/lib/types/fechas';
import { buscarReportes } from '../api';
import {
  FILTROS_VACIOS,
  MENSAJE_RANGO_INVERTIDO,
  type BoundingBox,
  type FiltrosMapa,
} from '../model/bbox';
import type { ReporteResumen } from '../model/tipos';
import { useBusquedaMapa } from './useBusquedaMapa';

vi.mock('../api', () => ({ buscarReportes: vi.fn() }));

const AREA: BoundingBox = { minLat: -12.13, minLon: -77.04, maxLat: -12.11, maxLon: -77.02 };
const REPORTE: ReporteResumen = { id: 7, estado: 'PENDIENTE', categoriaNombre: 'Bache' };

// El debounce es real (400 ms): se espera un poco más que eso.
const ESPERA = { timeout: 2000 };

function renderizar(filtros: FiltrosMapa = FILTROS_VACIOS) {
  return renderHook(({ f }) => useBusquedaMapa(f), { initialProps: { f: filtros } });
}

afterEach(() => {
  vi.mocked(buscarReportes).mockReset();
});

describe('useBusquedaMapa', () => {
  it('no consulta hasta que el mapa informa su área', async () => {
    vi.mocked(buscarReportes).mockResolvedValue({ contenido: [REPORTE], total: 1 });
    const { result } = renderizar();

    expect(result.current.cargando).toBe(false);
    expect(result.current.reportes).toEqual([]);
    expect(buscarReportes).not.toHaveBeenCalled();

    act(() => result.current.alCambiarArea(AREA));
    await waitFor(() => expect(result.current.reportes).toEqual([REPORTE]), ESPERA);
    expect(result.current.total).toBe(1);
    expect(buscarReportes).toHaveBeenCalledTimes(1);
  });

  it('envía las fechas del filtro con semántica de día local', async () => {
    vi.mocked(buscarReportes).mockResolvedValue({ contenido: [], total: 0 });
    const { result } = renderizar({
      ...FILTROS_VACIOS,
      fechaDesde: '2026-10-01',
      fechaHasta: '2026-10-05',
    });

    act(() => result.current.alCambiarArea(AREA));
    await waitFor(() => expect(buscarReportes).toHaveBeenCalledTimes(1), ESPERA);
    const query = new URLSearchParams(vi.mocked(buscarReportes).mock.calls[0]?.[0]);
    expect(query.get('fechaDesde')).toBe(inicioDelDiaLocal('2026-10-01'));
    expect(query.get('fechaHasta')).toBe(finDelDiaLocal('2026-10-05'));
  });

  it('con el rango invertido avisa y no consulta', async () => {
    vi.mocked(buscarReportes).mockResolvedValue({ contenido: [REPORTE], total: 1 });
    const { result, rerender } = renderizar();
    act(() => result.current.alCambiarArea(AREA));
    await waitFor(() => expect(result.current.reportes).toEqual([REPORTE]), ESPERA);

    rerender({ f: { ...FILTROS_VACIOS, fechaDesde: '2026-10-06', fechaHasta: '2026-10-05' } });
    expect(result.current.errorFiltros).toBe(MENSAJE_RANGO_INVERTIDO);

    // Pasado el debounce sigue habiendo una sola consulta, y los resultados
    // anteriores se conservan.
    await new Promise((r) => setTimeout(r, 600));
    expect(buscarReportes).toHaveBeenCalledTimes(1);
    expect(result.current.reportes).toEqual([REPORTE]);
  });

  it('muestra el mensaje del backend si rechaza la consulta', async () => {
    vi.mocked(buscarReportes).mockRejectedValue(
      new ApiError(400, 'El rango de fechas es inválido'),
    );
    const { result } = renderizar();

    act(() => result.current.alCambiarArea(AREA));
    await waitFor(() => expect(result.current.error).toBe('El rango de fechas es inválido'), ESPERA);
    expect(result.current.cargando).toBe(false);
  });
});

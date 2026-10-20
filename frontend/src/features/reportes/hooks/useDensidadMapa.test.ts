import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { ApiError } from '@/lib/api/errors';
import { densidadDeReportes } from '../api';
import { FILTROS_VACIOS, type BoundingBox, type FiltrosMapa } from '../model/bbox';
import type { DensidadReportes } from '../model/tipos';
import { useDensidadMapa } from './useDensidadMapa';

vi.mock('../api', () => ({ densidadDeReportes: vi.fn(), buscarReportes: vi.fn() }));

const AREA: BoundingBox = { minLat: -12.13, minLon: -77.04, maxLat: -12.11, maxLon: -77.02 };
const OTRA_AREA: BoundingBox = { minLat: -12.06, minLon: -77.01, maxLat: -12.04, maxLon: -76.99 };

const DENSIDAD: DensidadReportes = {
  celdaGrados: 0.001,
  totalReportes: 5,
  celdas: [
    { latitud: -12.12, longitud: -77.03, cantidad: 4 },
    { latitud: -12.115, longitud: -77.025, cantidad: 1 },
  ],
};

// El debounce es real (400 ms): se espera un poco más que eso.
const ESPERA = { timeout: 2000 };

interface Props {
  f: FiltrosMapa;
  activa: boolean;
  area: BoundingBox | null;
}

function renderizar(inicial: Partial<Props> = {}) {
  const initialProps: Props = { f: FILTROS_VACIOS, activa: true, area: AREA, ...inicial };
  return renderHook(({ f, activa, area }: Props) => useDensidadMapa(f, activa, area), {
    initialProps,
  });
}

afterEach(() => {
  vi.mocked(densidadDeReportes).mockReset();
});

describe('useDensidadMapa', () => {
  it('con la capa apagada no consulta nada', async () => {
    vi.mocked(densidadDeReportes).mockResolvedValue(DENSIDAD);
    const { result } = renderizar({ activa: false });

    await new Promise((r) => setTimeout(r, 600));
    expect(densidadDeReportes).not.toHaveBeenCalled();
    expect(result.current.celdas).toEqual([]);
    expect(result.current.consultaHecha).toBe(false);
    expect(result.current.sinReportesEnVista).toBe(false);
  });

  it('al encenderla consulta con los filtros y arma la capa de la vista', async () => {
    vi.mocked(densidadDeReportes).mockResolvedValue(DENSIDAD);
    const { result } = renderizar({ f: { ...FILTROS_VACIOS, categoriaId: 3, estado: 'RESUELTO' } });

    await waitFor(() => expect(result.current.consultaHecha).toBe(true), ESPERA);
    const query = new URLSearchParams(vi.mocked(densidadDeReportes).mock.calls[0]?.[0]);
    expect(query.get('categoriaId')).toBe('3');
    expect(query.get('estado')).toBe('RESUELTO');
    expect(query.has('minLat')).toBe(false);

    expect(result.current.maximo).toBe(4);
    expect(result.current.totalEnVista).toBe(5);
    expect(result.current.celdas.map((c) => c.nivel)).toEqual([1, 4]);
    expect(result.current.celdaGrados).toBe(0.001);
    expect(result.current.leyenda.length).toBeGreaterThan(0);
    expect(result.current.cargando).toBe(false);
  });

  it('mover el mapa no vuelve a consultar: solo recalcula la vista', async () => {
    vi.mocked(densidadDeReportes).mockResolvedValue(DENSIDAD);
    const { result, rerender } = renderizar();
    await waitFor(() => expect(result.current.consultaHecha).toBe(true), ESPERA);

    rerender({ f: FILTROS_VACIOS, activa: true, area: OTRA_AREA });
    await new Promise((r) => setTimeout(r, 600));

    expect(densidadDeReportes).toHaveBeenCalledTimes(1);
    expect(result.current.celdas).toEqual([]);
    expect(result.current.sinReportesEnVista).toBe(true);
  });

  it('cambiar un filtro sí vuelve a consultar', async () => {
    vi.mocked(densidadDeReportes).mockResolvedValue(DENSIDAD);
    const { result, rerender } = renderizar();
    await waitFor(() => expect(result.current.consultaHecha).toBe(true), ESPERA);

    rerender({ f: { ...FILTROS_VACIOS, distritoId: 21 }, activa: true, area: AREA });
    await waitFor(() => expect(densidadDeReportes).toHaveBeenCalledTimes(2), ESPERA);
    expect(new URLSearchParams(vi.mocked(densidadDeReportes).mock.calls[1]?.[0]).get('distritoId')).toBe(
      '21',
    );
  });

  it('respuesta sin celdas: estado vacío, no error', async () => {
    vi.mocked(densidadDeReportes).mockResolvedValue({ celdaGrados: 0.001, totalReportes: 0, celdas: [] });
    const { result } = renderizar();

    await waitFor(() => expect(result.current.sinReportesEnVista).toBe(true), ESPERA);
    expect(result.current.error).toBeNull();
    expect(result.current.leyenda).toEqual([]);
  });

  it('con el rango de fechas invertido no consulta', async () => {
    vi.mocked(densidadDeReportes).mockResolvedValue(DENSIDAD);
    renderizar({ f: { ...FILTROS_VACIOS, fechaDesde: '2026-10-06', fechaHasta: '2026-10-05' } });

    await new Promise((r) => setTimeout(r, 600));
    expect(densidadDeReportes).not.toHaveBeenCalled();
  });

  it('apagar la capa descarta lo dibujado', async () => {
    vi.mocked(densidadDeReportes).mockResolvedValue(DENSIDAD);
    const { result, rerender } = renderizar();
    await waitFor(() => expect(result.current.celdas).toHaveLength(2), ESPERA);

    rerender({ f: FILTROS_VACIOS, activa: false, area: AREA });
    expect(result.current.celdas).toEqual([]);
    expect(result.current.consultaHecha).toBe(false);
    expect(result.current.sinReportesEnVista).toBe(false);
  });

  it('muestra el mensaje del backend si rechaza la consulta', async () => {
    vi.mocked(densidadDeReportes).mockRejectedValue(new ApiError(400, 'El rango de fechas es inválido'));
    const { result } = renderizar();

    await waitFor(() => expect(result.current.error).toBe('El rango de fechas es inválido'), ESPERA);
    expect(result.current.cargando).toBe(false);
  });
});

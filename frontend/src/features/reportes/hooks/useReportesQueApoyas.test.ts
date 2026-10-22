import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { ApiError } from '@/lib/api/errors';
import { misAdhesiones } from '../api';
import type { ReporteResumen } from '../model/tipos';
import { useReportesQueApoyas } from './useReportesQueApoyas';

let avisarCambioDeCola: (() => void) | null = null;

vi.mock('../api', () => ({
  misAdhesiones: vi.fn(),
  colaDeReportes: {
    suscribir: (oyente: () => void) => {
      avisarCambioDeCola = oyente;
      return () => {
        avisarCambioDeCola = null;
      };
    },
  },
}));

const APOYADO: ReporteResumen = { id: 184, estado: 'EN_PROCESO', titulo: 'Bache frente al parque' };
const OTRO: ReporteResumen = { id: 190, estado: 'PENDIENTE', titulo: 'Hueco en la berma' };

afterEach(() => {
  vi.mocked(misAdhesiones).mockReset();
});

describe('useReportesQueApoyas (QA-1 M-6)', () => {
  it('devuelve los reportes que el ciudadano apoya', async () => {
    vi.mocked(misAdhesiones).mockResolvedValue([APOYADO]);
    const { result } = renderHook(() => useReportesQueApoyas());

    expect(result.current.estado).toBe('cargando');
    await waitFor(() => expect(result.current.estado).toBe('listo'));
    expect(result.current.datos).toEqual([APOYADO]);
  });

  it('una lista vacía es «listo», no un error', async () => {
    vi.mocked(misAdhesiones).mockResolvedValue([]);
    const { result } = renderHook(() => useReportesQueApoyas());

    await waitFor(() => expect(result.current.estado).toBe('listo'));
    expect(result.current.datos).toEqual([]);
  });

  it('si falla queda en error con su mensaje', async () => {
    vi.mocked(misAdhesiones).mockRejectedValue(new ApiError(500, 'Fallo'));
    const { result } = renderHook(() => useReportesQueApoyas());

    await waitFor(() => expect(result.current.estado).toBe('error'));
    expect(result.current.error).not.toBeNull();
  });

  it('US-06: un cambio en la cola offline vuelve a pedir la lista sin perder la visible', async () => {
    vi.mocked(misAdhesiones).mockResolvedValueOnce([APOYADO]).mockResolvedValueOnce([OTRO, APOYADO]);
    const { result } = renderHook(() => useReportesQueApoyas());
    await waitFor(() => expect(result.current.estado).toBe('listo'));

    act(() => avisarCambioDeCola?.());

    expect(result.current.datos).toEqual([APOYADO]);
    await waitFor(() => expect(result.current.datos).toEqual([OTRO, APOYADO]));
    expect(misAdhesiones).toHaveBeenCalledTimes(2);
  });
});

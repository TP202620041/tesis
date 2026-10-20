import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { colaDeReportes } from '@/pwa/colaReportes';
import type { ReporteEnCola } from '../model/colaOffline';
import { sincronizarCola } from './colaDeReportes';
import { useReportesEnCola, useSincronizacionAutomatica } from './useColaOffline';

vi.mock('./colaDeReportes', async (original) => ({
  ...(await original<typeof import('./colaDeReportes')>()),
  sincronizarCola: vi.fn(),
}));

function enCola(clave: string, usuarioId: number): ReporteEnCola {
  return {
    idempotencyKey: clave,
    usuarioId,
    creadoEn: '2026-10-19T10:00:00.000Z',
    datos: { latitud: -12.1, longitud: -77.0, categoriaId: 1, ubicacionManual: false },
    foto: null,
    estado: 'pendiente',
    motivo: null,
  };
}

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  vi.mocked(sincronizarCola).mockResolvedValue({ enviados: [], detenidaPor: null });
});

afterEach(() => {
  vi.mocked(sincronizarCola).mockReset();
});

describe('useReportesEnCola', () => {
  it('muestra los pendientes del usuario y se actualiza al cambiar la cola', async () => {
    await colaDeReportes.guardar(enCola('k1', 7));
    await colaDeReportes.guardar(enCola('ajeno', 8));
    const { result } = renderHook(() => useReportesEnCola(7));
    await waitFor(() => expect(result.current.pendientes).toHaveLength(1));

    await act(async () => {
      await result.current.descartar('k1');
    });

    await waitFor(() => expect(result.current.pendientes).toEqual([]));
  });
});

describe('useSincronizacionAutomatica', () => {
  it('con pendientes, sincroniza al montarse y otra vez al volver la conexion', async () => {
    await colaDeReportes.guardar(enCola('k1', 7));
    renderHook(() => useSincronizacionAutomatica(7));
    await waitFor(() => expect(sincronizarCola).toHaveBeenCalledTimes(1));

    act(() => {
      window.dispatchEvent(new Event('online'));
    });

    expect(sincronizarCola).toHaveBeenCalledTimes(2);
    expect(sincronizarCola).toHaveBeenLastCalledWith(7);
  });

  it('sin sesion o sin pendientes propios no intenta nada', async () => {
    await colaDeReportes.guardar(enCola('ajeno', 8));
    renderHook(() => useSincronizacionAutomatica(7));
    renderHook(() => useSincronizacionAutomatica(null));

    act(() => {
      window.dispatchEvent(new Event('online'));
    });
    await new Promise((r) => setTimeout(r, 50));
    expect(sincronizarCola).not.toHaveBeenCalled();
  });
});

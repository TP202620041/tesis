import { describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { ApiError } from '@/lib/api/errors';
import { useCarga } from './useCarga';

/** Promesa que el test resuelve cuando quiere, para simular respuestas lentas. */
function diferida<T>() {
  let resolver!: (valor: T) => void;
  const promesa = new Promise<T>((r) => {
    resolver = r;
  });
  return { promesa, resolver };
}

describe('useCarga', () => {
  it('pasa de cargando a listo con los datos', async () => {
    const { result } = renderHook(() => useCarga(() => Promise.resolve([1, 2]), []));

    expect(result.current.estado).toBe('cargando');
    await waitFor(() => expect(result.current.estado).toBe('listo'));
    expect(result.current.datos).toEqual([1, 2]);
    expect(result.current.error).toBeNull();
  });

  it('traduce el error con mensajeDeError', async () => {
    const { result } = renderHook(() =>
      useCarga(() => Promise.reject(new ApiError(404, 'Sin datos de desempeno')), []),
    );

    await waitFor(() => expect(result.current.estado).toBe('error'));
    expect(result.current.error).toEqual({ mensaje: 'Sin datos de desempeno', detalles: [] });
    expect(result.current.datos).toBeNull();
  });

  it('descarta la respuesta vieja si las dependencias cambian mientras estaba en vuelo', async () => {
    const lenta = diferida<string>();
    const rapida = diferida<string>();
    const cargar = vi.fn((id: number) => (id === 1 ? lenta.promesa : rapida.promesa));

    const { result, rerender } = renderHook(({ id }) => useCarga(() => cargar(id), [id]), {
      initialProps: { id: 1 },
    });
    rerender({ id: 2 });

    await act(async () => {
      rapida.resolver('reporte 2');
    });
    await waitFor(() => expect(result.current.datos).toBe('reporte 2'));

    // La respuesta del id 1 llega tarde: no debe pisar a la del id 2.
    await act(async () => {
      lenta.resolver('reporte 1');
    });
    expect(result.current.datos).toBe('reporte 2');
    expect(cargar).toHaveBeenCalledTimes(2);
  });

  it('no vuelve a cargar si las dependencias son iguales aunque sean objetos nuevos', async () => {
    const cargar = vi.fn(() => Promise.resolve('ok'));
    const { result, rerender } = renderHook(({ filtros }) => useCarga(cargar, [filtros]), {
      initialProps: { filtros: { estado: 'RECIBIDO' } },
    });
    await waitFor(() => expect(result.current.estado).toBe('listo'));

    rerender({ filtros: { estado: 'RECIBIDO' } });

    expect(cargar).toHaveBeenCalledTimes(1);
  });

  it('recargar vuelve a pedir los datos', async () => {
    let n = 0;
    const { result } = renderHook(() => useCarga(() => Promise.resolve(++n), []));
    await waitFor(() => expect(result.current.datos).toBe(1));

    act(() => result.current.recargar());

    await waitFor(() => expect(result.current.datos).toBe(2));
  });

  it('recargar conserva los datos visibles y marca recargando', async () => {
    const segunda = diferida<number>();
    const cargar = vi.fn().mockResolvedValueOnce(1).mockReturnValueOnce(segunda.promesa);
    const { result } = renderHook(() => useCarga<number>(cargar, []));
    await waitFor(() => expect(result.current.datos).toBe(1));

    act(() => result.current.recargar());

    // Mientras llega la respuesta, sigue en `listo` con los datos anteriores.
    await waitFor(() => expect(result.current.recargando).toBe(true));
    expect(result.current.estado).toBe('listo');
    expect(result.current.datos).toBe(1);

    await act(async () => {
      segunda.resolver(2);
    });
    expect(result.current.datos).toBe(2);
    expect(result.current.recargando).toBe(false);
  });

  it('si cambian las dependencias vuelve a cargando (los datos ya no corresponden)', async () => {
    const lenta = diferida<string>();
    const cargar = vi.fn((id: number) => (id === 1 ? Promise.resolve('uno') : lenta.promesa));
    const { result, rerender } = renderHook(({ id }) => useCarga(() => cargar(id), [id]), {
      initialProps: { id: 1 },
    });
    await waitFor(() => expect(result.current.datos).toBe('uno'));

    rerender({ id: 2 });

    await waitFor(() => expect(result.current.estado).toBe('cargando'));
    expect(result.current.recargando).toBe(false);
    await act(async () => {
      lenta.resolver('dos');
    });
    expect(result.current.datos).toBe('dos');
  });

  it('reintentar desde un error pasa por cargando', async () => {
    const reintento = diferida<string>();
    const cargar = vi
      .fn()
      .mockRejectedValueOnce(new ApiError(500, 'Fallo'))
      .mockReturnValueOnce(reintento.promesa);
    const { result } = renderHook(() => useCarga<string>(cargar, []));
    await waitFor(() => expect(result.current.estado).toBe('error'));

    act(() => result.current.recargar());

    await waitFor(() => expect(result.current.estado).toBe('cargando'));
    await act(async () => {
      reintento.resolver('ok');
    });
    expect(result.current.datos).toBe('ok');
  });

  it('no escribe estado tras desmontarse', async () => {
    const lenta = diferida<string>();
    const errorDeConsola = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { result, unmount } = renderHook(() => useCarga(() => lenta.promesa, []));
    const antes = result.current;

    unmount();
    await act(async () => {
      lenta.resolver('tarde');
    });

    expect(result.current).toBe(antes);
    expect(errorDeConsola).not.toHaveBeenCalled();
    errorDeConsola.mockRestore();
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { descargarFotoModerada } from '../api';
import { useFotoModerada } from './useFotoModerada';

vi.mock('../api', () => ({ descargarFotoModerada: vi.fn() }));

const revocar = vi.fn();

beforeEach(() => {
  vi.mocked(descargarFotoModerada).mockReset();
  revocar.mockReset();
  vi.stubGlobal('URL', { ...URL, revokeObjectURL: revocar });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useFotoModerada (NC-11b)', () => {
  it('devuelve la URL blob: y la libera al desmontar', async () => {
    vi.mocked(descargarFotoModerada).mockResolvedValue('blob:a');
    const { result, unmount } = renderHook(() => useFotoModerada(42, true));

    expect(result.current.cargando).toBe(true);
    await waitFor(() => expect(result.current.src).toBe('blob:a'));
    expect(result.current.cargando).toBe(false);
    expect(descargarFotoModerada).toHaveBeenCalledWith(42);
    expect(revocar).not.toHaveBeenCalled();

    unmount();
    expect(revocar).toHaveBeenCalledWith('blob:a');
  });

  it('una descarga que llega después de cambiar de reporte se libera y no se muestra', async () => {
    let resolverVieja: (url: string) => void = () => {};
    vi.mocked(descargarFotoModerada)
      .mockImplementationOnce(() => new Promise((r) => (resolverVieja = r)))
      .mockResolvedValueOnce('blob:nueva');
    const { result, rerender } = renderHook(({ id }) => useFotoModerada(id, true), {
      initialProps: { id: 1 },
    });

    rerender({ id: 2 });
    await waitFor(() => expect(result.current.src).toBe('blob:nueva'));

    resolverVieja('blob:vieja');
    await waitFor(() => expect(revocar).toHaveBeenCalledWith('blob:vieja'));
    expect(result.current.src).toBe('blob:nueva');
  });

  it('si la descarga falla (404, red) avisa con `fallo`', async () => {
    vi.mocked(descargarFotoModerada).mockRejectedValue(new Error('404'));
    const { result } = renderHook(() => useFotoModerada(42, true));

    await waitFor(() => expect(result.current.fallo).toBe(true));
    expect(result.current.src).toBeNull();
    expect(result.current.cargando).toBe(false);
  });

  it('sin foto no descarga nada', () => {
    const { result } = renderHook(() => useFotoModerada(42, false));
    expect(descargarFotoModerada).not.toHaveBeenCalled();
    expect(result.current).toEqual({ src: null, fallo: false, cargando: false });
  });

  it('`version` fuerza a volver a pedirla (p. ej. tras restablecer la foto)', async () => {
    vi.mocked(descargarFotoModerada).mockResolvedValue('blob:a');
    const { result, rerender } = renderHook(({ v }) => useFotoModerada(42, true, v), { initialProps: { v: 0 } });
    await waitFor(() => expect(result.current.src).toBe('blob:a'));

    rerender({ v: 1 });
    await waitFor(() => expect(descargarFotoModerada).toHaveBeenCalledTimes(2));
    expect(revocar).toHaveBeenCalledWith('blob:a');
  });
});

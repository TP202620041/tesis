import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { descargarFotoDePerfil } from '../api';
import { useFotoDePerfil } from './useFotoDePerfil';

vi.mock('../api', () => ({ descargarFotoDePerfil: vi.fn() }));

const revocar = vi.fn();

beforeEach(() => {
  vi.mocked(descargarFotoDePerfil).mockReset();
  revocar.mockReset();
  vi.stubGlobal('URL', { ...URL, revokeObjectURL: revocar });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useFotoDePerfil (US-30)', () => {
  it('devuelve la URL blob: y la libera al desmontar', async () => {
    vi.mocked(descargarFotoDePerfil).mockResolvedValue('blob:a');
    const { result, unmount } = renderHook(() => useFotoDePerfil('/api/perfiles/fotos/a.png'));

    await waitFor(() => expect(result.current.src).toBe('blob:a'));
    expect(revocar).not.toHaveBeenCalled();

    unmount();
    expect(revocar).toHaveBeenCalledWith('blob:a');
  });

  it('una descarga que llega después de cambiar de foto se libera y no se muestra', async () => {
    let resolverVieja: (url: string) => void = () => {};
    vi.mocked(descargarFotoDePerfil)
      .mockImplementationOnce(() => new Promise((r) => (resolverVieja = r)))
      .mockResolvedValueOnce('blob:nueva');
    const { result, rerender } = renderHook(({ url }) => useFotoDePerfil(url), {
      initialProps: { url: '/api/perfiles/fotos/vieja.png' },
    });

    rerender({ url: '/api/perfiles/fotos/nueva.png' });
    await waitFor(() => expect(result.current.src).toBe('blob:nueva'));

    resolverVieja('blob:vieja');
    await waitFor(() => expect(revocar).toHaveBeenCalledWith('blob:vieja'));
    expect(result.current.src).toBe('blob:nueva');
  });

  it('si la descarga falla, avisa con `fallo` y no muestra nada', async () => {
    vi.mocked(descargarFotoDePerfil).mockRejectedValue(new Error('401'));
    const { result } = renderHook(() => useFotoDePerfil('/api/perfiles/fotos/a.png'));

    await waitFor(() => expect(result.current.fallo).toBe(true));
    expect(result.current.src).toBeNull();
  });

  it('sin foto no descarga nada', () => {
    const { result } = renderHook(() => useFotoDePerfil(null));
    expect(descargarFotoDePerfil).not.toHaveBeenCalled();
    expect(result.current).toEqual({ src: null, fallo: false });
  });
});

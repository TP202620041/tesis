import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { ApiError, NetworkError } from '@/lib/api/errors';
import { clasificarFoto } from '../api';
import { ESPERA_MAXIMA_DE_SUGERENCIA_MS, type SugerenciaDeCategoria } from '../model/sugerencia';
import { useSugerenciaDeCategoria } from './useSugerenciaDeCategoria';

vi.mock('../api', () => ({ clasificarFoto: vi.fn() }));

const BACHE: SugerenciaDeCategoria = { categoriaId: 1, categoriaNombre: 'Bache' };
const PISTA: SugerenciaDeCategoria = { categoriaId: 2, categoriaNombre: 'Pista deteriorada' };

const foto = (nombre: string) => new File(['x'], nombre, { type: 'image/jpeg' });

/** Promesa que el test resuelve cuando quiere (una respuesta que «tarda»). */
function diferida<T>() {
  let resolver!: (valor: T) => void;
  let rechazar!: (error: unknown) => void;
  const promesa = new Promise<T>((res, rej) => {
    resolver = res;
    rechazar = rej;
  });
  return { promesa, resolver, rechazar };
}

/** Como `fetch`: rechaza con `NetworkError` (lo que da el cliente) al cancelarse. */
function hastaQueSeCancele(_foto: File, signal?: AbortSignal): Promise<SugerenciaDeCategoria | null> {
  return new Promise((_, rechazar) => {
    signal?.addEventListener('abort', () => rechazar(new NetworkError()));
  });
}

const senalDe = (llamada: number) => vi.mocked(clasificarFoto).mock.calls[llamada]?.[1];

function renderizar(inicial: File | null) {
  return renderHook(({ f }: { f: File | null }) => useSugerenciaDeCategoria(f), {
    initialProps: { f: inicial },
  });
}

afterEach(() => {
  vi.mocked(clasificarFoto).mockReset();
  vi.useRealTimers();
});

describe('useSugerenciaDeCategoria (NC-04)', () => {
  it('sin foto no pregunta nada', () => {
    const { result } = renderizar(null);
    expect(result.current.estado).toBe('inactiva');
    expect(clasificarFoto).not.toHaveBeenCalled();
  });

  it('con foto: «analizando» y después la sugerencia, en una sola petición', async () => {
    const respuesta = diferida<SugerenciaDeCategoria | null>();
    vi.mocked(clasificarFoto).mockReturnValue(respuesta.promesa);
    const elegida = foto('bache.jpg');

    const { result } = renderizar(elegida);
    expect(result.current.estado).toBe('analizando');
    expect(clasificarFoto).toHaveBeenCalledWith(elegida, expect.any(AbortSignal));

    await act(async () => respuesta.resolver(BACHE));
    expect(result.current).toMatchObject({ estado: 'lista', sugerencia: BACHE });
    expect(clasificarFoto).toHaveBeenCalledTimes(1);
  });

  it('sin sugerencia: la respuesta llega con null', async () => {
    vi.mocked(clasificarFoto).mockResolvedValue(null);
    const { result } = renderizar(foto('pared.jpg'));
    await waitFor(() => expect(result.current.estado).toBe('lista'));
    expect(result.current).toMatchObject({ sugerencia: null });
  });

  it.each([
    ['sin conexión', new NetworkError()],
    ['un 5xx', new ApiError(500, 'Ocurrió un error inesperado.')],
    ['el 401 de una sesión vencida', new ApiError(401, 'Tu sesión expiró.')],
    ['el 413', new ApiError(413, 'Archivo demasiado grande')],
  ])('con %s queda sin sugerencia y sin error que mostrar', async (_caso, error) => {
    vi.mocked(clasificarFoto).mockRejectedValue(error);
    const { result } = renderizar(foto('bache.jpg'));
    await waitFor(() => expect(result.current.estado).toBe('lista'));
    expect(result.current).toMatchObject({ sugerencia: null });
    expect(clasificarFoto).toHaveBeenCalledTimes(1);
  });

  it('el 409 de formato se distingue: la foto no sirve tampoco para el reporte', async () => {
    vi.mocked(clasificarFoto).mockRejectedValue(
      new ApiError(409, 'Formato de foto no permitido (usa JPG, PNG o WEBP)'),
    );
    const { result } = renderizar(foto('falsa.jpg'));
    await waitFor(() => expect(result.current.estado).toBe('foto-rechazada'));
    expect(result.current).toMatchObject({
      mensaje: 'Formato de foto no permitido (usa JPG, PNG o WEBP)',
    });
  });

  it('una foto nueva cancela la anterior y su respuesta tardía no se muestra', async () => {
    const primera = diferida<SugerenciaDeCategoria | null>();
    const segunda = diferida<SugerenciaDeCategoria | null>();
    vi.mocked(clasificarFoto)
      .mockReturnValueOnce(primera.promesa)
      .mockReturnValueOnce(segunda.promesa);
    const fotoA = foto('a.jpg');
    const fotoB = foto('b.jpg');

    const { result, rerender } = renderizar(fotoA);
    rerender({ f: fotoB });

    expect(senalDe(0)?.aborted).toBe(true);
    expect(senalDe(1)?.aborted).toBe(false);
    expect(result.current.estado).toBe('analizando');

    // La nueva llega primero; la vieja, después: no la pisa.
    await act(async () => segunda.resolver(PISTA));
    await act(async () => primera.resolver(BACHE));
    expect(result.current).toMatchObject({ estado: 'lista', sugerencia: PISTA });
  });

  it('la respuesta de la foto anterior tampoco se muestra si llega antes que la nueva', async () => {
    const primera = diferida<SugerenciaDeCategoria | null>();
    vi.mocked(clasificarFoto)
      .mockReturnValueOnce(primera.promesa)
      .mockImplementationOnce(hastaQueSeCancele);

    const { result, rerender } = renderizar(foto('a.jpg'));
    rerender({ f: foto('b.jpg') });
    await act(async () => primera.resolver(BACHE));

    expect(result.current.estado).toBe('analizando');
  });

  it('quitar la foto cancela la vista previa y no deja nada', async () => {
    vi.mocked(clasificarFoto).mockImplementation(hastaQueSeCancele);
    const { result, rerender } = renderizar(foto('a.jpg'));

    rerender({ f: null });

    expect(senalDe(0)?.aborted).toBe(true);
    expect(result.current.estado).toBe('inactiva');
  });

  it('descartar (al enviar el reporte) cancela la vista previa en curso y no la muestra', async () => {
    const respuesta = diferida<SugerenciaDeCategoria | null>();
    vi.mocked(clasificarFoto).mockReturnValue(respuesta.promesa);
    const { result } = renderizar(foto('bache.jpg'));

    act(() => result.current.descartar());
    expect(senalDe(0)?.aborted).toBe(true);
    expect(result.current.estado).toBe('inactiva');

    await act(async () => respuesta.resolver(BACHE));
    expect(result.current.estado).toBe('inactiva');
    expect(clasificarFoto).toHaveBeenCalledTimes(1);
  });

  it('descartar después de la respuesta no cambia lo que se muestra', async () => {
    vi.mocked(clasificarFoto).mockResolvedValue(BACHE);
    const { result } = renderizar(foto('bache.jpg'));
    await waitFor(() => expect(result.current.estado).toBe('lista'));

    act(() => result.current.descartar());

    expect(result.current).toMatchObject({ estado: 'lista', sugerencia: BACHE });
  });

  it('una foto nueva después de descartar vuelve a preguntar', async () => {
    vi.mocked(clasificarFoto).mockImplementationOnce(hastaQueSeCancele).mockResolvedValueOnce(PISTA);
    const { result, rerender } = renderizar(foto('a.jpg'));
    act(() => result.current.descartar());

    rerender({ f: foto('b.jpg') });

    await waitFor(() => expect(result.current.estado).toBe('lista'));
    expect(result.current).toMatchObject({ sugerencia: PISTA });
  });

  it('si la respuesta no llega a tiempo, se cancela y queda sin sugerencia', async () => {
    vi.useFakeTimers();
    vi.mocked(clasificarFoto).mockImplementation(hastaQueSeCancele);
    const { result } = renderizar(foto('bache.jpg'));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(ESPERA_MAXIMA_DE_SUGERENCIA_MS - 1);
    });
    expect(result.current.estado).toBe('analizando');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(senalDe(0)?.aborted).toBe(true);
    expect(result.current).toMatchObject({ estado: 'lista', sugerencia: null });
  });

  it('al desmontarse (reporte enviado) cancela la petición en curso', () => {
    vi.mocked(clasificarFoto).mockImplementation(hastaQueSeCancele);
    const { unmount } = renderizar(foto('bache.jpg'));

    unmount();

    expect(senalDe(0)?.aborted).toBe(true);
  });
});

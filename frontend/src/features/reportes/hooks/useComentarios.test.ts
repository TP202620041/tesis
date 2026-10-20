import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { ApiError } from '@/lib/api/errors';
import { comentar, listarComentarios } from '../api';
import type { ComentarioPublico } from '../model/tipos';
import { useComentarios } from './useComentarios';

vi.mock('../api', () => ({ comentar: vi.fn(), listarComentarios: vi.fn() }));

const PRIMERO = { id: 1, contenido: 'Quedó bien', autor: 'Ana' } as ComentarioPublico;
const SEGUNDO = { id: 2, contenido: 'Volvió a abrirse', autor: 'Luis' } as ComentarioPublico;

afterEach(() => {
  vi.mocked(comentar).mockReset();
  vi.mocked(listarComentarios).mockReset();
});

describe('useComentarios (US-27)', () => {
  it('carga los comentarios del reporte', async () => {
    vi.mocked(listarComentarios).mockResolvedValue([PRIMERO]);
    const { result } = renderHook(() => useComentarios(8));
    expect(result.current.cargando).toBe(true);
    await waitFor(() => expect(result.current.cargando).toBe(false));
    expect(result.current.comentarios).toEqual([PRIMERO]);
  });

  it('si la lectura falla muestra la lista vacía', async () => {
    vi.mocked(listarComentarios).mockRejectedValue(new ApiError(500, 'Fallo'));
    const { result } = renderHook(() => useComentarios(8));
    await waitFor(() => expect(result.current.cargando).toBe(false));
    expect(result.current.comentarios).toEqual([]);
  });

  it('tras publicar vuelve a pedir la lista', async () => {
    vi.mocked(listarComentarios).mockResolvedValueOnce([PRIMERO]).mockResolvedValueOnce([PRIMERO, SEGUNDO]);
    vi.mocked(comentar).mockResolvedValue(SEGUNDO);
    const { result } = renderHook(() => useComentarios(8));
    await waitFor(() => expect(result.current.cargando).toBe(false));

    let ok = false;
    await act(async () => {
      ok = await result.current.publicar('Volvió a abrirse');
    });

    expect(ok).toBe(true);
    expect(comentar).toHaveBeenCalledWith(8, 'Volvió a abrirse');
    await waitFor(() => expect(result.current.comentarios).toEqual([PRIMERO, SEGUNDO]));
  });

  it('un comentario vacío no llega al backend', async () => {
    vi.mocked(listarComentarios).mockResolvedValue([]);
    const { result } = renderHook(() => useComentarios(8));
    let ok = true;
    await act(async () => {
      ok = await result.current.publicar('   ');
    });
    expect(ok).toBe(false);
    expect(comentar).not.toHaveBeenCalled();
  });

  it('el 409 llega con su mensaje y no recarga', async () => {
    vi.mocked(listarComentarios).mockResolvedValue([PRIMERO]);
    vi.mocked(comentar).mockRejectedValue(new ApiError(409, 'El reporte no está resuelto'));
    const { result } = renderHook(() => useComentarios(8));
    await waitFor(() => expect(result.current.cargando).toBe(false));

    await act(async () => {
      await result.current.publicar('Hola');
    });

    expect(result.current.error?.mensaje).toBe('El reporte no está resuelto');
    expect(listarComentarios).toHaveBeenCalledTimes(1);
  });
});

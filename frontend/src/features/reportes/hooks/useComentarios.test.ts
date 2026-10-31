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

  it('NC-10c: un 400 TEXTO_NO_PERMITIDO queda para el campo, con lo escrito, y no recarga', async () => {
    const mensaje = 'El comentario tiene palabras que no están permitidas. Cámbialo para continuar.';
    vi.mocked(listarComentarios).mockResolvedValue([PRIMERO]);
    vi.mocked(comentar).mockRejectedValueOnce(
      new ApiError(400, mensaje, '/api/reportes/8/comentarios', ['contenido'], 'TEXTO_NO_PERMITIDO'),
    );
    const { result } = renderHook(() => useComentarios(8));
    await waitFor(() => expect(result.current.cargando).toBe(false));

    let ok = true;
    await act(async () => {
      ok = await result.current.publicar('Sigue roto, qué grosería');
    });

    expect(ok).toBe(false);
    expect(result.current.textoRechazado).toEqual({
      campo: 'contenido',
      mensaje,
      valor: 'Sigue roto, qué grosería',
    });
    expect(result.current.error).toBeNull();
    expect(listarComentarios).toHaveBeenCalledTimes(1);

    // Publicar de nuevo lo borra.
    vi.mocked(comentar).mockResolvedValueOnce(SEGUNDO);
    await act(async () => {
      await result.current.publicar('Sigue roto');
    });
    expect(result.current.textoRechazado).toBeNull();
  });
});

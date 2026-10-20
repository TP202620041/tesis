import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { ApiError } from '@/lib/api/errors';
import { calificar, miCalificacion } from '../api';
import type { Calificacion } from '../model/tipos';
import { useCalificar } from './useCalificar';

vi.mock('../api', () => ({ calificar: vi.fn(), miCalificacion: vi.fn() }));

const CUATRO = { estrellas: 4, comentario: 'Bien' } as Calificacion;

afterEach(() => {
  vi.mocked(calificar).mockReset();
  vi.mocked(miCalificacion).mockReset();
});

describe('useCalificar (US-26)', () => {
  it('muestra la calificación ya emitida', async () => {
    vi.mocked(miCalificacion).mockResolvedValue(CUATRO);
    const { result } = renderHook(() => useCalificar(3));
    expect(result.current.cargando).toBe(true);
    await waitFor(() => expect(result.current.cargando).toBe(false));
    expect(result.current.existente).toBe(CUATRO);
  });

  it('si la consulta falla deja calificar (el 409 del POST lo dirá)', async () => {
    vi.mocked(miCalificacion).mockRejectedValue(new ApiError(500, 'Fallo'));
    const { result } = renderHook(() => useCalificar(3));
    await waitFor(() => expect(result.current.cargando).toBe(false));
    expect(result.current.existente).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it('adopta lo que guardó el servidor', async () => {
    vi.mocked(miCalificacion).mockResolvedValue(null);
    vi.mocked(calificar).mockResolvedValue(CUATRO);
    const { result } = renderHook(() => useCalificar(3));
    await waitFor(() => expect(result.current.cargando).toBe(false));

    let ok = false;
    await act(async () => {
      ok = await result.current.enviar(4, 'Bien');
    });

    expect(ok).toBe(true);
    expect(calificar).toHaveBeenCalledWith(3, 4, 'Bien');
    expect(result.current.existente).toBe(CUATRO);
  });

  it('sin estrellas no llega al backend', async () => {
    vi.mocked(miCalificacion).mockResolvedValue(null);
    const { result } = renderHook(() => useCalificar(3));
    await act(async () => {
      await result.current.enviar(0, '');
    });
    expect(calificar).not.toHaveBeenCalled();
    expect(result.current.error?.mensaje).toBe('Elige de 1 a 5 estrellas.');
  });

  it('el 409 (ya calificaste) llega con su mensaje', async () => {
    vi.mocked(miCalificacion).mockResolvedValue(null);
    vi.mocked(calificar).mockRejectedValue(new ApiError(409, 'Ya calificaste este reporte'));
    const { result } = renderHook(() => useCalificar(3));
    await act(async () => {
      await result.current.enviar(5, '');
    });
    expect(result.current.error?.mensaje).toBe('Ya calificaste este reporte');
    expect(result.current.existente).toBeNull();
    expect(result.current.enviando).toBe(false);
  });
});

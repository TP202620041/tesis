import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { ApiError, NetworkError } from '@/lib/api/errors';
import { cambiarEstado } from '../api';
import type { ReporteGestion } from '../model/tipos';
import { useCambiarEstado } from './useCambiarEstado';

vi.mock('../api', () => ({ cambiarEstado: vi.fn() }));

afterEach(() => vi.mocked(cambiarEstado).mockReset());

async function cambiar(destino: string, comentario = '') {
  const { result } = renderHook(() => useCambiarEstado());
  let devuelto: ReporteGestion | null = null;
  await act(async () => {
    devuelto = await result.current.cambiar(4, destino, comentario);
  });
  return { result, devuelto: devuelto as ReporteGestion | null };
}

describe('useCambiarEstado (US-14)', () => {
  it('devuelve el reporte que confirma el backend', async () => {
    const actualizado = { id: 4, estado: 'RECIBIDO' } as ReporteGestion;
    vi.mocked(cambiarEstado).mockResolvedValue(actualizado);

    const { result, devuelto } = await cambiar('RECIBIDO', 'Visto');

    expect(cambiarEstado).toHaveBeenCalledWith(4, 'RECIBIDO', 'Visto');
    expect(devuelto).toBe(actualizado);
    expect(result.current.error).toBeNull();
  });

  it('rechazar sin motivo no llega al backend', async () => {
    const { result, devuelto } = await cambiar('RECHAZADO', '   ');

    expect(cambiarEstado).not.toHaveBeenCalled();
    expect(devuelto).toBeNull();
    expect(result.current.error?.mensaje).toBe('Para rechazar un reporte debes explicar el motivo.');
  });

  it('sin destino no hace nada', async () => {
    const { result, devuelto } = await cambiar('');
    expect(cambiarEstado).not.toHaveBeenCalled();
    expect(devuelto).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it('el 409 del backend llega con su mensaje', async () => {
    vi.mocked(cambiarEstado).mockRejectedValue(new ApiError(409, 'Transición inválida', '', ['x']));
    const { result, devuelto } = await cambiar('RESUELTO');
    expect(devuelto).toBeNull();
    expect(result.current.error).toEqual({ mensaje: 'Transición inválida', detalles: ['x'] });
    expect(result.current.enviando).toBe(false);
  });

  it('sin red avisa con el mensaje de mensajeDeError', async () => {
    vi.mocked(cambiarEstado).mockRejectedValue(new NetworkError());
    const { result } = await cambiar('RECIBIDO');
    expect(result.current.error?.mensaje).toMatch(/Sin conexión/);
  });
});

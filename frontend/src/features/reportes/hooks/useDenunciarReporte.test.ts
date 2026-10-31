import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { ApiError, NetworkError } from '@/lib/api/errors';
import { denunciarReporte } from '../api';
import { useDenunciarReporte } from './useDenunciarReporte';

vi.mock('../api', () => ({ denunciarReporte: vi.fn() }));

afterEach(() => {
  vi.mocked(denunciarReporte).mockReset();
});

const REGISTRADA = { id: 7, reporteId: 42, motivo: 'OFENSIVO', createdAt: '2026-10-29T14:50:00Z' } as const;

describe('useDenunciarReporte (NC-11b)', () => {
  it('con 201 guarda la denuncia registrada y devuelve true', async () => {
    vi.mocked(denunciarReporte).mockResolvedValue(REGISTRADA);
    const { result } = renderHook(() => useDenunciarReporte(42));

    let ok = false;
    await act(async () => {
      ok = await result.current.denunciar({ motivo: 'OFENSIVO', detalle: 'Insulta a un vecino' });
    });

    expect(ok).toBe(true);
    expect(denunciarReporte).toHaveBeenCalledWith(42, { motivo: 'OFENSIVO', detalle: 'Insulta a un vecino' });
    expect(result.current.registrada).toEqual(REGISTRADA);
    expect(result.current.error).toBeNull();
    expect(result.current.enviando).toBe(false);
  });

  it.each([
    ['DENUNCIA_REPETIDA', 'Ya denunciaste este reporte', true],
    ['LIMITE_DENUNCIAS', 'Alcanzaste el máximo de denuncias por hoy', false],
    ['DENUNCIA_PROPIA', 'No puedes denunciar tu propio reporte', true],
  ])('el 409 %s se traduce por código (definitivo: %s)', async (codigo, mensaje, definitivo) => {
    vi.mocked(denunciarReporte).mockRejectedValue(new ApiError(409, 'texto del backend', '', [], codigo));
    const { result } = renderHook(() => useDenunciarReporte(42));

    let ok = true;
    await act(async () => {
      ok = await result.current.denunciar({ motivo: 'OTRO' });
    });

    expect(ok).toBe(false);
    expect(result.current.error).toEqual({ mensaje, definitivo });
    expect(result.current.registrada).toBeNull();
  });

  it('el 404 (retirado u oculto mientras lo miraba) tiene su mensaje', async () => {
    vi.mocked(denunciarReporte).mockRejectedValue(new ApiError(404, 'No se encontró'));
    const { result } = renderHook(() => useDenunciarReporte(42));
    await act(async () => {
      await result.current.denunciar({ motivo: 'FALSO' });
    });
    expect(result.current.error).toEqual({ mensaje: 'Este reporte ya no está disponible.', definitivo: false });
  });

  it('otros fallos pasan por mensajeDeError (sin conexión)', async () => {
    vi.mocked(denunciarReporte).mockRejectedValue(new NetworkError());
    const { result } = renderHook(() => useDenunciarReporte(42));
    await act(async () => {
      await result.current.denunciar({ motivo: 'FALSO' });
    });
    expect(result.current.error?.mensaje).toBe('Sin conexión con el servidor. Revisa tu red.');
    expect(result.current.error?.definitivo).toBe(false);
  });

  it('reiniciar limpia el error para volver a intentar', async () => {
    vi.mocked(denunciarReporte).mockRejectedValue(new ApiError(500, 'Fallo'));
    const { result } = renderHook(() => useDenunciarReporte(42));
    await act(async () => {
      await result.current.denunciar({ motivo: 'FALSO' });
    });
    expect(result.current.error).not.toBeNull();
    act(() => result.current.reiniciar());
    expect(result.current.error).toBeNull();
  });
});

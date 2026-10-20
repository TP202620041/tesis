import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { ApiError } from '@/lib/api/errors';
import { asignarResponsable, responsableActivo } from '../api';
import type { AsignacionResponsable } from '../model/tipos';
import { useResponsable } from './useResponsable';

vi.mock('../api', () => ({ asignarResponsable: vi.fn(), responsableActivo: vi.fn() }));

const CUADRILLA = { responsable: 'Cuadrilla 3' } as AsignacionResponsable;
const OBRAS = { responsable: 'Obras Públicas', notas: 'Urgente' } as AsignacionResponsable;

afterEach(() => {
  vi.mocked(asignarResponsable).mockReset();
  vi.mocked(responsableActivo).mockReset();
});

describe('useResponsable (US-15)', () => {
  it('carga el responsable vigente', async () => {
    vi.mocked(responsableActivo).mockResolvedValue(CUADRILLA);
    const { result } = renderHook(() => useResponsable(5, 'RECIBIDO'));

    expect(result.current.cargando).toBe(true);
    await waitFor(() => expect(result.current.cargando).toBe(false));
    expect(result.current.actual).toBe(CUADRILLA);
    expect(responsableActivo).toHaveBeenCalledWith(5);
  });

  it('un fallo al consultarlo se muestra como sin responsable', async () => {
    vi.mocked(responsableActivo).mockRejectedValue(new ApiError(500, 'Fallo'));
    const { result } = renderHook(() => useResponsable(5, 'RECIBIDO'));
    await waitFor(() => expect(result.current.cargando).toBe(false));
    expect(result.current.actual).toBeNull();
  });

  it('asignar adopta la respuesta del servidor sin otra consulta', async () => {
    vi.mocked(responsableActivo).mockResolvedValue(null);
    vi.mocked(asignarResponsable).mockResolvedValue(OBRAS);
    const { result } = renderHook(() => useResponsable(5, 'EN_PROCESO'));
    await waitFor(() => expect(result.current.cargando).toBe(false));

    let ok = false;
    await act(async () => {
      ok = await result.current.asignar('Obras Públicas', 'Urgente');
    });

    expect(ok).toBe(true);
    expect(asignarResponsable).toHaveBeenCalledWith(5, 'Obras Públicas', 'Urgente');
    expect(result.current.actual).toBe(OBRAS);
    expect(responsableActivo).toHaveBeenCalledTimes(1);
  });

  it('un nombre vacío no llega al backend', async () => {
    vi.mocked(responsableActivo).mockResolvedValue(null);
    const { result } = renderHook(() => useResponsable(5, 'RECIBIDO'));
    let ok = true;
    await act(async () => {
      ok = await result.current.asignar('  ', '');
    });
    expect(ok).toBe(false);
    expect(asignarResponsable).not.toHaveBeenCalled();
  });

  it('el 409 llega con su mensaje y no cambia el responsable', async () => {
    vi.mocked(responsableActivo).mockResolvedValue(CUADRILLA);
    vi.mocked(asignarResponsable).mockRejectedValue(new ApiError(409, 'El estado no admite asignación'));
    const { result } = renderHook(() => useResponsable(5, 'RECIBIDO'));
    await waitFor(() => expect(result.current.cargando).toBe(false));

    await act(async () => {
      await result.current.asignar('Otra', '');
    });

    expect(result.current.error?.mensaje).toBe('El estado no admite asignación');
    expect(result.current.actual).toBe(CUADRILLA);
  });

  it('un cambio de estado vuelve a consultar y deja atrás la asignación local', async () => {
    vi.mocked(responsableActivo).mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    vi.mocked(asignarResponsable).mockResolvedValue(OBRAS);
    const { result, rerender } = renderHook(({ estado }) => useResponsable(5, estado), {
      initialProps: { estado: 'EN_PROCESO' },
    });
    await waitFor(() => expect(result.current.cargando).toBe(false));
    await act(async () => {
      await result.current.asignar('Obras Públicas', '');
    });
    expect(result.current.actual).toBe(OBRAS);

    rerender({ estado: 'RESUELTO' });

    await waitFor(() => expect(responsableActivo).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(result.current.cargando).toBe(false));
    expect(result.current.actual).toBeNull();
  });
});
